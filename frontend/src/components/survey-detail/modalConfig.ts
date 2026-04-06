import type { ModalType } from './types'

export interface ModalConfig {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'danger' | 'primary'
}

export function getModalConfig(activeModal: ModalType, surveyTitle: string): ModalConfig | null {
  if (activeModal === 'activate') {
    return {
      title: 'Activate Survey',
      message: `Are you sure you want to activate "${surveyTitle}"? Respondents will be able to submit responses once the survey is active.`,
      confirmLabel: 'Activate',
      confirmVariant: 'primary',
    }
  }
  if (activeModal === 'close') {
    return {
      title: 'Close Survey',
      message: `Are you sure you want to close "${surveyTitle}"? No new responses will be accepted after closing.`,
      confirmLabel: 'Close Survey',
      confirmVariant: 'danger',
    }
  }
  if (activeModal === 'archive') {
    return {
      title: 'Archive Survey',
      message: `Are you sure you want to archive "${surveyTitle}"? The survey will be hidden from the main list.`,
      confirmLabel: 'Archive',
      confirmVariant: 'danger',
    }
  }
  if (activeModal === 'delete') {
    return {
      title: 'Delete Survey',
      message: `Are you sure you want to delete "${surveyTitle}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    }
  }
  if (activeModal === 'clone') {
    return {
      title: 'Clone Survey',
      message: `Create a copy of "${surveyTitle}"? The new survey will be created as a draft.`,
      confirmLabel: 'Clone',
      confirmVariant: 'primary',
    }
  }
  return null
}
