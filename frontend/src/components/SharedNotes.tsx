import React, { useState, useEffect } from 'react';
import { Journal, JournalPage, HandoutEvent } from '../types/foundry';
import {
  BookOpen,
  Plus,
  Save,
  Eye,
  Edit3,
  X,
  FileText,
  CheckCircle,
  Share2,
  Image as ImageIcon,
  Menu
} from 'lucide-react';
import { BottomSheet } from './ui/BottomSheet';

interface SharedNotesProps {
  journals: Journal[];
  activeHandout: HandoutEvent | null;
  onDismissHandout: () => void;
  onSendCommand: (action: string, params: Record<string, any>) => Promise<any>;
  isMobile?: boolean;
}

export const SharedNotes: React.FC<SharedNotesProps> = ({
  journals,
  activeHandout,
  onDismissHandout,
  onSendCommand,
  isMobile = false,
}) => {
  const [isMobilePageDrawerOpen, setIsMobilePageDrawerOpen] = useState(false);
  // Find "Party Shared Notes" journal or fallback to first journal
  const defaultJournal =
    journals.find(j => j.name.toLowerCase().includes('shared') || j.name.toLowerCase().includes('party')) ||
    journals[0];

  const [selectedJournalId, setSelectedJournalId] = useState<string>(defaultJournal?.id || '');
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [pageTitle, setPageTitle] = useState<string>('');
  const [isEditing, setIsEditing] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  const currentJournal = journals.find(j => j.id === selectedJournalId) || defaultJournal;
  const currentPages: JournalPage[] = currentJournal?.pages || [];

  // When current journal changes, pick first page
  useEffect(() => {
    if (currentJournal && currentJournal.pages.length > 0 && !selectedPageId) {
      const firstPage = currentJournal.pages[0];
      setSelectedPageId(firstPage.id);
      setPageTitle(firstPage.name);
      setMarkdownContent(firstPage.content || firstPage.text || '');
      setSaveStatus('saved');
    }
  }, [currentJournal, selectedPageId]);

  const handleSelectPage = (page: JournalPage) => {
    setSelectedPageId(page.id);
    setPageTitle(page.name);
    setMarkdownContent(page.content || page.text || '');
    setSaveStatus('saved');
  };

  const handleCreateNewPage = async () => {
    const newName = `Note ${currentPages.length + 1}`;
    const initialContent = `# ${newName}\n\nStart typing notes here...`;
    try {
      setSaveStatus('saving');
      await onSendCommand('UPSERT_JOURNAL_PAGE', {
        journalName: currentJournal?.name || 'Party Shared Notes',
        pageName: newName,
        markdownContent: initialContent,
        showToPlayers: false,
      });
      setPageTitle(newName);
      setMarkdownContent(initialContent);
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to create new journal page:', err);
      setSaveStatus('dirty');
    }
  };

  const handleSaveNote = async () => {
    if (!pageTitle.trim()) return;
    try {
      setSaveStatus('saving');
      await onSendCommand('UPSERT_JOURNAL_PAGE', {
        journalName: currentJournal?.name || 'Party Shared Notes',
        pageName: pageTitle,
        markdownContent: markdownContent,
        showToPlayers: false,
      });
      setSaveStatus('saved');
    } catch (err) {
      console.error('Failed to save note to Foundry:', err);
      setSaveStatus('dirty');
    }
  };

  const handleBroadcastPage = async () => {
    try {
      await onSendCommand('UPSERT_JOURNAL_PAGE', {
        journalName: currentJournal?.name || 'Party Shared Notes',
        pageName: pageTitle,
        markdownContent: markdownContent,
        showToPlayers: true,
      });
    } catch (err) {
      console.error('Failed to broadcast note:', err);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Handout Modal Popup */}
      {activeHandout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={onDismissHandout}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
              <Share2 className="w-4 h-4" />
              <span>Tabletop Handout Pushed by GM</span>
            </div>

            <h2 className="text-2xl font-black text-white mb-4">
              {activeHandout.title || activeHandout.pageName}
            </h2>

            {activeHandout.src && (
              <div className="mb-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 max-h-96 flex items-center justify-center">
                <img
                  src={activeHandout.src}
                  alt={activeHandout.title}
                  className="max-h-96 object-contain"
                />
              </div>
            )}

            <div
              className="prose prose-invert prose-sm text-slate-200 leading-relaxed max-w-none whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: activeHandout.content.replace(/<[^>]*>?/gm, '')
              }}
            />

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={onDismissHandout}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-lg text-xs transition"
              >
                Dismiss Handout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Journal View */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-6 min-h-[620px]">
        {/* Left Sidebar: Pages List (Desktop only) */}
        {!isMobile && (
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Campaign Notes</h3>
              </div>
              <button
                onClick={handleCreateNewPage}
                className="p-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 text-xs transition"
                title="Add New Note Page"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Journal selector if multiple */}
            {journals.length > 1 && (
              <select
                value={selectedJournalId}
                onChange={(e) => {
                  setSelectedJournalId(e.target.value);
                  setSelectedPageId('');
                }}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg p-2 mb-3 focus:outline-none focus:border-amber-500"
              >
                {journals.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            )}

            {/* Page list */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {currentPages.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  No note pages in this journal.
                </div>
              ) : (
                currentPages.map(page => {
                  const isSelected = selectedPageId === page.id;
                  return (
                    <button
                      key={page.id}
                      onClick={() => handleSelectPage(page)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{page.name || 'Untitled Page'}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Right Pane: Markdown Editor / Live Preview */}
        <div className="flex-1 flex flex-col">
          {/* Mobile Top Page Switcher Bar */}
          {isMobile && (
            <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
              <button
                onClick={() => setIsMobilePageDrawerOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-amber-400 max-w-[200px] truncate"
              >
                <Menu className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{pageTitle || 'Choose Page'}</span>
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={handleSaveNote}
                  className="px-2.5 py-1.5 bg-slate-800 text-xs font-bold text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5 text-amber-400" />
                  <span>Save</span>
                </button>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`p-1.5 rounded-lg border border-slate-800 ${
                    isEditing ? 'bg-amber-500 text-slate-950' : 'bg-slate-950 text-slate-400'
                  }`}
                  title={isEditing ? 'Preview' : 'Edit'}
                >
                  {isEditing ? <Eye className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => {
                setPageTitle(e.target.value);
                setSaveStatus('dirty');
              }}
              placeholder="Page Title..."
              className="bg-transparent text-lg font-bold text-white border-0 focus:outline-none placeholder:text-slate-600 flex-1"
            />

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                {saveStatus === 'saved' ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Saved
                  </>
                ) : saveStatus === 'saving' ? (
                  'Saving...'
                ) : (
                  'Unsaved changes'
                )}
              </span>

              <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                <button
                  onClick={() => setIsEditing(true)}
                  className={`p-1.5 rounded transition ${
                    isEditing ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Editor Mode"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className={`p-1.5 rounded transition ${
                    !isEditing ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Preview Mode"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={handleSaveNote}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition flex items-center gap-1"
              >
                <Save className="w-3.5 h-3.5 text-amber-400" />
                <span>Save</span>
              </button>

              <button
                onClick={handleBroadcastPage}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                title="Pop up this page on all connected player screens"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Push Handout</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[450px]">
            {isEditing ? (
              <textarea
                value={markdownContent}
                onChange={(e) => {
                  setMarkdownContent(e.target.value);
                  setSaveStatus('dirty');
                }}
                placeholder="Write shared notes, quests, lore, or secrets using Markdown..."
                className="w-full h-full min-h-[450px] bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
              />
            ) : (
              <div className="w-full h-full min-h-[450px] bg-slate-950/70 border border-slate-800 rounded-lg p-6 overflow-y-auto">
                <div
                  className="prose prose-invert prose-sm max-w-none text-slate-200 whitespace-pre-wrap leading-relaxed font-sans"
                  dangerouslySetInnerHTML={{
                    __html: markdownContent.replace(/<[^>]*>?/gm, '')
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Page Selector Bottom Sheet */}
      {isMobile && (
        <BottomSheet
          isOpen={isMobilePageDrawerOpen}
          onClose={() => setIsMobilePageDrawerOpen(false)}
          title="Campaign Note Pages"
          subtitle={currentJournal?.name}
        >
          <div className="space-y-3">
            <button
              onClick={() => {
                handleCreateNewPage();
                setIsMobilePageDrawerOpen(false);
              }}
              className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Note Page</span>
            </button>

            <div className="space-y-1.5 pt-2">
              {currentPages.map(page => {
                const isSelected = selectedPageId === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => {
                      handleSelectPage(page);
                      setIsMobilePageDrawerOpen(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-300 hover:bg-slate-800 bg-slate-950'
                    }`}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{page.name || 'Untitled Page'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
