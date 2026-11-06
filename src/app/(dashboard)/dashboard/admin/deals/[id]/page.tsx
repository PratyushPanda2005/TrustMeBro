import { Suspense } from "react"

import { DealDetail } from "@/components/dashboard/deal-detail"

export default function Page() {
  return (
    <Suspense>
      <DealDetail role="admin" />
    </Suspense>
  )
}
