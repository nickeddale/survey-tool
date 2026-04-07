import { useState } from 'react'
import { Button } from '../ui/button'

interface DevLoginPanelProps {
  onLogin: (credentials: { email: string; password: string }) => Promise<void>
}

const DEV_ACCOUNTS = [
  { name: 'Dev Creator', email: 'creator@dev.local', password: 'password123' },
  { name: 'Second Creator', email: 'creator2@dev.local', password: 'password123' },
]

export function DevLoginPanel({ onLogin }: DevLoginPanelProps) {
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null)

  async function handleClick(index: number) {
    const account = DEV_ACCOUNTS[index]
    setLoadingIndex(index)
    try {
      await onLogin({ email: account.email, password: account.password })
    } finally {
      setLoadingIndex(null)
    }
  }

  const isLoading = loadingIndex !== null

  return (
    <div className='mt-4 rounded-md border border-dashed border-muted-foreground/30 p-3'>
      <p className='mb-2 text-xs text-muted-foreground'>Dev Accounts</p>
      <div className='flex flex-col gap-2'>
        {DEV_ACCOUNTS.map((account, index) => (
          <Button
            key={account.email}
            type='button'
            variant='outline'
            size='sm'
            disabled={isLoading}
            onClick={() => handleClick(index)}
            className='w-full justify-start text-left'
          >
            <span className='font-medium'>{account.name}</span>
            <span className='ml-2 text-muted-foreground'>{account.email}</span>
            {loadingIndex === index && (
              <span className='ml-auto text-xs text-muted-foreground'>Signing in...</span>
            )}
          </Button>
        ))}
      </div>
    </div>
  )
}
