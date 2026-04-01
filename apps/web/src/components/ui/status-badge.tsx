import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ExecutionStatus } from '@/lib/api'

const statusConfig: Record<
  ExecutionStatus,
  { label: string; className: string }
> = {
  running: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  success: {
    label: 'Success',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  },
}

interface StatusBadgeProps {
  status: ExecutionStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
