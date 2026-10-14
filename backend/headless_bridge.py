"""
Headless GM Client for Foundry Tabletop Hub
Maintains an active Assistant GM session ('MCP Bot') in the background so the
foundry-hub-bridge WebSocket is persistently connected without interfering with the human GM.
Includes Windows PID locking, process cleanup, and zero-canvas resource optimization.
"""

import atexit
import logging
import os
import signal
import subprocess
import sys
import time
from typing import Optional
from playwright.sync_api import sync_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("headless-bridge")

FOUNDRY_URL = os.getenv("FOUNDRY_URL", "http://localhost:30000")
PREFERRED_BOT_USER = os.getenv("FOUNDRY_BOT_USER", "MCP Bot")
FALLBACK_GM_USER = os.getenv("FOUNDRY_GM_USER", "Gamemaster")
PID_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".headless.pid")

_browser_instance = None

def cleanup_stale_pid_process():
    """Kill any previously orphaned headless bridge process recorded in PID file."""
    if not os.path.exists(PID_FILE):
        return
    try:
        with open(PID_FILE, "r") as f:
            old_pid = int(f.read().strip())
        current_pid = os.getpid()
        if old_pid and old_pid != current_pid:
            logger.info(f"Cleaning up previous headless bridge process tree (PID: {old_pid})...")
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(old_pid)], capture_output=True)
            else:
                os.kill(old_pid, signal.SIGTERM)
    except Exception as e:
        logger.debug(f"PID cleanup note: {e}")
    finally:
        try:
            if os.path.exists(PID_FILE):
                os.remove(PID_FILE)
        except Exception:
            pass

def register_current_pid():
    """Record current process PID to lockfile and bind cleanup handlers."""
    with open(PID_FILE, "w") as f:
        f.write(str(os.getpid()))

    def _on_exit():
        global _browser_instance
        if _browser_instance:
            try:
                _browser_instance.close()
            except Exception:
                pass
        if os.path.exists(PID_FILE):
            try:
                os.remove(PID_FILE)
            except Exception:
                pass

    atexit.register(_on_exit)

    def _sig_handler(signum, frame):
        _on_exit()
        sys.exit(0)

    signal.signal(signal.SIGINT, _sig_handler)
    signal.signal(signal.SIGTERM, _sig_handler)

def run_headless_bridge(url: str = FOUNDRY_URL):
    cleanup_stale_pid_process()
    register_current_pid()

    logger.info(f"Starting headless Tabletop Hub bridge client for {url}...")

    global _browser_instance
    with sync_playwright() as p:
        browser = None
        for channel in ["msedge", "chrome", None]:
            try:
                browser = p.chromium.launch(
                    channel=channel,
                    headless=True,
                    args=[
                        "--disable-gpu",
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-background-timer-throttling",
                        "--disable-backgrounding-occluded-windows",
                        "--disable-renderer-backgrounding"
                    ]
                )
                logger.info(f"Launched browser using channel: {channel or 'bundled chromium'}")
                break
            except Exception as e:
                logger.debug(f"Channel {channel} unavailable: {e}")

        if not browser:
            logger.error("Could not launch any Chromium-compatible browser.")
            sys.exit(1)

        _browser_instance = browser
        context = browser.new_context()
        page = context.new_page()

        try:
            logger.info(f"Navigating to {url}/join ...")
            page.goto(f"{url}/join", timeout=20000, wait_until="networkidle")

            # Check if login form is present
            if "/game" not in page.url:
                page.wait_for_selector("select[name='userId']", timeout=10000)

                # Check if "MCP Bot" exists in the options
                users = page.eval_on_selector_all(
                    "select[name='userId'] option",
                    "options => options.map(o => ({ id: o.value, name: o.text.trim() }))"
                )
                user_names = [u["name"] for u in users]

                target_user = PREFERRED_BOT_USER if PREFERRED_BOT_USER in user_names else FALLBACK_GM_USER
                logger.info(f"Logging in as '{target_user}' (available: {user_names})...")

                page.select_option("select[name='userId']", label=target_user)
                page.click("button[name='join']")
                page.wait_for_url("**/game", timeout=20000)
                logger.info(f"Successfully entered game session as '{target_user}'.")

            # If logged in as Gamemaster but "MCP Bot" does not exist yet, provision MCP Bot
            provision_bot_script = """
            (async () => {
              if (game.user.isGM && !game.users.getName("MCP Bot")) {
                await User.create({
                  name: "MCP Bot",
                  role: CONST.USER_ROLES.ASSISTANT || 3
                });
                return "Provisioned MCP Bot user";
              }
              return "MCP Bot already exists or not GM";
            })()
            """
            try:
                prov_result = page.evaluate(provision_bot_script)
                logger.info(f"Bot provisioning status: {prov_result}")
            except Exception as e:
                logger.debug(f"Bot provisioning note: {e}")

            # Wait for bridge module to connect (allowing for automatic reload if noCanvas gets enabled)
            logger.info("Waiting for Tabletop Hub GM Bridge WebSocket connection...")
            connected = False
            for _ in range(45):
                try:
                    # Wait briefly if page is reloading
                    if "/game" not in page.url:
                        page.wait_for_url("**/game", timeout=10000)
                    ready = page.evaluate(
                        "Boolean(window.foundryHubBridge && window.foundryHubBridge.socket && window.foundryHubBridge.socket.readyState === 1)"
                    )
                    if ready:
                        connected = True
                        logger.info("[SUCCESS] Tabletop Hub Bridge is actively connected and ready!")
                        break
                except Exception:
                    pass
                time.sleep(1)

            if not connected:
                logger.warning("Bridge did not reach ready state within 45s. Entering monitoring loop...")

            # Persistent heartbeat loop
            while True:
                time.sleep(10)
                if page.is_closed():
                    logger.warning("Headless browser page closed. Exiting.")
                    break

        except KeyboardInterrupt:
            logger.info("Headless bridge stopped by user.")
        except Exception as e:
            logger.error(f"Error in headless bridge: {e}")
        finally:
            try:
                browser.close()
            except Exception:
                pass

if __name__ == "__main__":
    run_headless_bridge()
