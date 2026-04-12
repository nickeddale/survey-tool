import { ArrowLeft, Pencil, Copy, Download, Trash2, List, BarChart2, Users } from 'lucide-react'
import { Button } from '../ui/button'
import type { ModalType } from './types'

interface SurveyActionsProps {
  surveyId: string
  surveyStatus: string
  onNavigate: (path: string) => void
  onOpenModal: (type: ModalType) => void
  onExport: () => void
  onBack: () => void
}

export function SurveyHeader({
  title,
  onBack,
  statusBadge,
}: {
  title: string
  onBack: () => void
  statusBadge: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onBack}
        aria-label="Back to surveys"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={18} />
      </Button>
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-foreground truncate">{title}</h1>
      </div>
      {statusBadge}
    </div>
  )
}

export function SurveyActions({
  surveyId,
  surveyStatus,
  onNavigate,
  onOpenModal,
  onExport,
  onBack: _onBack,
}: SurveyActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {/* Status transition actions */}
      {surveyStatus === 'draft' && (
        <Button
          onClick={() => onOpenModal('activate')}
          className="bg-green-600 text-white hover:bg-green-700"
          data-testid="activate-button"
        >
          Activate
        </Button>
      )}
      {surveyStatus === 'active' && (
        <Button
          onClick={() => onOpenModal('close')}
          className="bg-yellow-600 text-white hover:bg-yellow-700"
          data-testid="close-button"
        >
          Close
        </Button>
      )}
      {surveyStatus === 'closed' && (
        <Button
          variant="destructive"
          onClick={() => onOpenModal('archive')}
          data-testid="archive-button"
        >
          Archive
        </Button>
      )}

      <div className="flex-1" />

      <Button
        variant="outline"
        onClick={() => onNavigate(`/surveys/${surveyId}/responses`)}
        aria-label="View responses"
        data-testid="view-responses-button"
      >
        <List size={14} />
        Responses
      </Button>

      <Button
        variant="outline"
        onClick={() => onNavigate(`/surveys/${surveyId}/quotas`)}
        aria-label="Manage quotas"
        data-testid="manage-quotas-button"
      >
        <BarChart2 size={14} />
        Quotas
      </Button>

      <Button
        variant="outline"
        onClick={() => onNavigate(`/surveys/${surveyId}/assessments`)}
        aria-label="Manage assessments"
        data-testid="manage-assessments-button"
      >
        <BarChart2 size={14} />
        Assessments
      </Button>

      <Button
        variant="outline"
        onClick={() => onNavigate(`/surveys/${surveyId}/participants`)}
        aria-label="Manage participants"
        data-testid="manage-participants-button"
      >
        <Users size={14} />
        Participants
      </Button>

      {surveyStatus === 'draft' && (
        <Button
          variant="outline"
          onClick={() => onNavigate(`/surveys/${surveyId}/edit`)}
          aria-label="Edit survey"
          data-testid="edit-button"
        >
          <Pencil size={14} />
          Edit
        </Button>
      )}
      <Button
        variant="outline"
        onClick={() => onOpenModal('clone')}
        aria-label="Clone survey"
        data-testid="clone-button"
      >
        <Copy size={14} />
        Clone
      </Button>
      <Button
        variant="outline"
        onClick={onExport}
        aria-label="Export survey"
        data-testid="export-button"
      >
        <Download size={14} />
        Export
      </Button>
      <Button
        variant="outline"
        onClick={() => onOpenModal('delete')}
        aria-label="Delete survey"
        className="border-destructive/30 text-destructive hover:bg-destructive/10"
        data-testid="delete-button"
      >
        <Trash2 size={14} />
        Delete
      </Button>
    </div>
  )
}
