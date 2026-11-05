"use client"

import { toast } from "sonner"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>trustmebro</CardTitle>
          <CardDescription>
            Next.js, TypeScript, Tailwind and shadcn/ui are ready. Start
            building in <code>src/app/page.tsx</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Button onClick={() => toast.success("Everything is wired up.")}>
            Test a toast
          </Button>
          <ThemeToggle />
        </CardContent>
      </Card>
    </main>
  )
}
