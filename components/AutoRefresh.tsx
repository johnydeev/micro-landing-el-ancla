'use client'

import { startTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        router.refresh()
      })
    }, REFRESH_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [router])

  return null
}
