"""
Pydantic models and schemas for Foundry Tabletop Hub
"""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field

class RPCRequest(BaseModel):
    requestId: str
    action: str
    params: Dict[str, Any] = Field(default_factory=dict)

class RPCResponse(BaseModel):
    type: str = "RPC_RESPONSE"
    requestId: str
    result: Optional[Any] = None
    error: Optional[str] = None

class ClientCommand(BaseModel):
    action: str
    params: Dict[str, Any] = Field(default_factory=dict)

class DiceResult(BaseModel):
    faces: int
    results: List[Dict[str, Any]] = Field(default_factory=list)

class RollData(BaseModel):
    formula: str
    total: Union[int, float]
    isCritical: bool = False
    isFumble: bool = False
    dice: List[DiceResult] = Field(default_factory=list)

class ActionLogPayload(BaseModel):
    id: str
    timestamp: int
    user: str = "Unknown"
    speaker: str = "Unknown"
    actorId: Optional[str] = None
    flavor: str = ""
    content: str = ""
    isRoll: bool = False
    whisper: List[str] = Field(default_factory=list)
    rolls: List[RollData] = Field(default_factory=list)

class HandoutPayload(BaseModel):
    type: str = "HANDOUT_SHOWN"
    timestamp: int
    journalId: Optional[str] = None
    pageId: Optional[str] = None
    title: str = ""
    pageName: Optional[str] = None
    content: str = ""
    src: Optional[str] = None

class HubState(BaseModel):
    isFoundryConnected: bool = False
    actors: List[Dict[str, Any]] = Field(default_factory=list)
    partyInventory: Optional[Dict[str, Any]] = None
    journals: List[Dict[str, Any]] = Field(default_factory=list)
    activeScene: Optional[Dict[str, Any]] = None
    actionLogs: List[Dict[str, Any]] = Field(default_factory=list)
