import { useRouteError } from 'react-router'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

/** 路由渲染异常兜底页（react-router errorElement） */
export function RouteError() {
  const error = useRouteError()
  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  )
}
