export interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  confirmVariant?: 'danger' | 'primary'
  isLoading?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export type ModalType = 'activate' | 'close' | 'archive' | 'delete' | 'clone' | null
