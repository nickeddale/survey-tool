/**
 * BuilderToolbar — sticky top toolbar for the survey builder page.
 *
 * Contains:
 *   - Back navigation button
 *   - Survey title (inline editable)
 *   - Status badge
 *   - Save indicator
 *   - Undo / Redo buttons
 *   - Add Group button
 *   - Add Question dropdown (quick-adds to last group)
 *   - Preview toggle button
 *   - Activate button (draft surveys only) with confirmation dialog
 *   - Responsive overflow dropdown (collapses secondary actions on sm screens)
 */

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Languages,
  Lock,
  MoreHorizontal,
  Plus,
  Undo2,
  Redo2,
  Type,
  AlignLeft,
  ToggleLeft,
  CheckSquare,
  List,
  Hash,
  Zap,
} from 'lucide-react'
import { useBuilderStore } from '../../store/builderStore'
import surveyService from '../../services/surveyService'
import { SaveIndicator } from './SaveIndicator'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
}

const QUESTION_TYPES = [
  { type: 'text', label: 'Short Text', icon: Type },
  { type: 'textarea', label: 'Long Text', icon: AlignLeft },
  { type: 'radio', label: 'Single Choice', icon: ToggleLeft },
  { type: 'checkbox', label: 'Multiple Choice', icon: CheckSquare },
  { type: 'select', label: 'Dropdown', icon: List },
  { type: 'number', label: 'Number', icon: Hash },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuilderToolbarProps {
  surveyId: string
  isPreviewMode: boolean
  onTogglePreview: () => void
  isTranslationMode: boolean
  onToggleTranslation: () => void
  readOnly: boolean
  undoRedoPendingRef: React.MutableRefObject<boolean>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BuilderToolbar({
  surveyId,
  isPreviewMode,
  onTogglePreview,
  isTranslationMode,
  onToggleTranslation,
  readOnly,
  undoRedoPendingRef,
}: BuilderToolbarProps) {
  const navigate = useNavigate()

  const title = useBuilderStore((s) => s.title)
  const status = useBuilderStore((s) => s.status)
  const saveStatus = useBuilderStore((s) => s.saveStatus)
  const undoStack = useBuilderStore((s) => s.undoStack)
  const redoStack = useBuilderStore((s) => s.redoStack)
  const groups = useBuilderStore((s) => s.groups)
  const setSaveStatus = useBuilderStore((s) => s.setSaveStatus)
  const setTitle = useBuilderStore((s) => s.setTitle)
  const undo = useBuilderStore((s) => s.undo)
  const redo = useBuilderStore((s) => s.redo)
  const addGroup = useBuilderStore((s) => s.addGroup)
  const addQuestion = useBuilderStore((s) => s.addQuestion)

  // Local state for inline title editing
  const [editingTitle, setEditingTitle] = useState(false)
  const [localTitle, setLocalTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Activate dialog state
  const [activateDialogOpen, setActivateDialogOpen] = useState(false)
  const [isActivating, setIsActivating] = useState(false)

  // Add group loading state
  const [isAddingGroup, setIsAddingGroup] = useState(false)

  // Add question loading state
  const [isAddingQuestion, setIsAddingQuestion] = useState(false)

  // ---------------------------------------------------------------------------
  // Inline title editing
  // ---------------------------------------------------------------------------

  function handleTitleClick() {
    if (readOnly) return
    setLocalTitle(title)
    setEditingTitle(true)
    // Focus the input on next tick after render
    setTimeout(() => titleInputRef.current?.select(), 0)
  }

  async function commitTitle() {
    const trimmed = localTitle.trim()
    if (!trimmed || trimmed === title) {
      setEditingTitle(false)
      return
    }
    setTitle(trimmed)
    setEditingTitle(false)
    // Persist to API
    setSaveStatus('saving')
    try {
      await surveyService.updateSurvey(surveyId, { title: trimmed })
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error', 'Failed to save title. Please try again.')
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitTitle()
    } else if (e.key === 'Escape') {
      setEditingTitle(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Add Group
  // ---------------------------------------------------------------------------

  async function handleAddGroup() {
    if (readOnly || isAddingGroup) return
    setIsAddingGroup(true)
    try {
      const newGroup = await surveyService.createGroup(surveyId, {
        title: `Group ${groups.length + 1}`,
      })
      addGroup({ ...newGroup, questions: [] })
    } finally {
      setIsAddingGroup(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Add Question (quick-add to last group)
  // ---------------------------------------------------------------------------

  async function handleAddQuestion(questionType: string) {
    if (readOnly || isAddingQuestion) return
    const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order)
    const lastGroup = sortedGroups[sortedGroups.length - 1]
    if (!lastGroup) return

    setIsAddingQuestion(true)
    try {
      const label = QUESTION_TYPES.find((qt) => qt.type === questionType)?.label ?? 'New Question'
      const newQuestion = await surveyService.createQuestion(surveyId, lastGroup.id, {
        question_type: questionType,
        title: `New ${label}`,
      })
      addQuestion(lastGroup.id, {
        ...newQuestion,
        answer_options: newQuestion.answer_options ?? [],
        subquestions: [],
      })
    } finally {
      setIsAddingQuestion(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Activate survey
  // ---------------------------------------------------------------------------

  async function handleActivate() {
    setIsActivating(true)
    try {
      await surveyService.activateSurvey(surveyId)
      setActivateDialogOpen(false)
      navigate(`/surveys/${surveyId}`)
    } catch {
      // Keep dialog open on error so user can retry or cancel
    } finally {
      setIsActivating(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statusCls = STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'

  return (
    <TooltipProvider>
      <header
        className="sticky top-0 z-20 flex items-center gap-2 px-4 py-2 border-b border-border bg-background shrink-0"
        data-testid="builder-toolbar"
      >
        {/* Back button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => navigate(`/surveys/${surveyId}`)}
              aria-label="Back to survey"
              data-testid="toolbar-back-button"
            >
              <ArrowLeft size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to survey</TooltipContent>
        </Tooltip>

        {/* Survey title — inline editable */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              className="w-full text-lg font-semibold bg-transparent border-b border-primary outline-none truncate"
              aria-label="Survey title"
              data-testid="builder-title-input"
            />
          ) : (
            <h1
              className={`text-lg font-semibold text-foreground truncate ${readOnly ? '' : 'cursor-text hover:text-primary/80'}`}
              onClick={handleTitleClick}
              title={readOnly ? title : 'Click to edit title'}
              data-testid="builder-title"
            >
              {title}
            </h1>
          )}
        </div>

        {/* Status badge */}
        <span
          className={`hidden sm:inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium capitalize shrink-0 ${statusCls}`}
          data-testid="status-badge"
        >
          {status}
        </span>

        {/* Save indicator */}
        {!readOnly && (
          <div className="hidden sm:flex shrink-0">
            <SaveIndicator
              onRetry={saveStatus === 'error' ? () => setSaveStatus('idle') : undefined}
            />
          </div>
        )}

        {/* Undo / Redo */}
        {!readOnly && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    undoRedoPendingRef.current = true
                    undo()
                  }}
                  disabled={undoStack.length === 0}
                  aria-label="Undo (Ctrl+Z)"
                  data-testid="undo-button"
                >
                  <Undo2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    undoRedoPendingRef.current = true
                    redo()
                  }}
                  disabled={redoStack.length === 0}
                  aria-label="Redo (Ctrl+Shift+Z)"
                  data-testid="redo-button"
                >
                  <Redo2 size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Add Group — hidden on small screens, shown in overflow dropdown */}
        {!readOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="hidden md:flex h-8 gap-1 shrink-0"
                onClick={handleAddGroup}
                disabled={isAddingGroup}
                data-testid="toolbar-add-group-button"
              >
                <Plus size={14} />
                {isAddingGroup ? 'Adding…' : 'Add Group'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a new question group</TooltipContent>
          </Tooltip>
        )}

        {/* Add Question dropdown — hidden on small screens */}
        {!readOnly && groups.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:flex h-8 gap-1 shrink-0"
                    disabled={isAddingQuestion}
                    data-testid="toolbar-add-question-button"
                  >
                    <Plus size={14} />
                    Add Question
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Add a question to the last group</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Question Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={type}
                  onClick={() => handleAddQuestion(type)}
                  data-testid={`add-question-type-${type}`}
                >
                  <Icon size={14} />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Preview toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isPreviewMode ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1 shrink-0"
              onClick={onTogglePreview}
              aria-pressed={isPreviewMode}
              data-testid="preview-mode-toggle"
            >
              {isPreviewMode ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">
                {isPreviewMode ? 'Exit Preview' : 'Preview'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isPreviewMode ? 'Exit preview mode' : 'Toggle preview mode'}
          </TooltipContent>
        </Tooltip>

        {/* Full preview button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:flex h-8 gap-1 shrink-0"
              onClick={() => navigate(`/surveys/${surveyId}/preview`)}
              data-testid="full-preview-button"
            >
              <Eye size={14} />
              <span className="hidden md:inline">Full Preview</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open full survey preview page</TooltipContent>
        </Tooltip>

        {/* Translations toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isTranslationMode ? 'default' : 'outline'}
              size="sm"
              className="h-8 gap-1 shrink-0"
              onClick={onToggleTranslation}
              aria-pressed={isTranslationMode}
              data-testid="translation-mode-toggle"
            >
              <Languages size={14} />
              <span className="hidden sm:inline">
                {isTranslationMode ? 'Exit Translations' : 'Translations'}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isTranslationMode ? 'Exit translation mode' : 'Toggle translation editor'}
          </TooltipContent>
        </Tooltip>

        {/* Activate button (draft only) */}
        {!readOnly && status === 'draft' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="hidden sm:flex h-8 gap-1 shrink-0 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setActivateDialogOpen(true)}
                data-testid="toolbar-activate-button"
              >
                <Zap size={14} />
                Activate
              </Button>
            </TooltipTrigger>
            <TooltipContent>Activate this survey to collect responses</TooltipContent>
          </Tooltip>
        )}

        {/* Read-only badge */}
        {readOnly && (
          <Badge
            variant="outline"
            className="hidden sm:flex gap-1 border-amber-400 text-amber-700 bg-amber-50 shrink-0"
            data-testid="read-only-badge"
          >
            <Lock size={12} />
            Read-only
          </Badge>
        )}

        {/* Overflow dropdown — visible on small screens */}
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 md:hidden shrink-0"
                aria-label="More actions"
                data-testid="toolbar-overflow-menu"
              >
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {status === 'draft' && (
                <>
                  <DropdownMenuItem
                    onClick={() => setActivateDialogOpen(true)}
                    data-testid="overflow-activate"
                  >
                    <Zap size={14} />
                    Activate Survey
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={handleAddGroup}
                disabled={isAddingGroup}
                data-testid="overflow-add-group"
              >
                <Plus size={14} />
                Add Group
              </DropdownMenuItem>
              {groups.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Add Question</DropdownMenuLabel>
                  {QUESTION_TYPES.map(({ type, label, icon: Icon }) => (
                    <DropdownMenuItem
                      key={type}
                      onClick={() => handleAddQuestion(type)}
                      data-testid={`overflow-add-question-type-${type}`}
                    >
                      <Icon size={14} />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {/* Activate confirmation dialog */}
      <Dialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate Survey</DialogTitle>
            <DialogDescription>
              Activating this survey will make it available to collect responses. Once active, you
              will not be able to edit the survey structure. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActivateDialogOpen(false)}
              disabled={isActivating}
              data-testid="activate-dialog-cancel"
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleActivate}
              disabled={isActivating}
              data-testid="activate-dialog-confirm"
            >
              {isActivating ? 'Activating…' : 'Activate Survey'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

export default BuilderToolbar
