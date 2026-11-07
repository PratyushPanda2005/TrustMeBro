"use client"

import { useState } from "react"
import { Wallet as WalletIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { chooseWallet, connectWallet, useWallet } from "@/lib/trade/wallet"

const short = (address: string) =>
  `${address.slice(0, 6)}...${address.slice(-4)}`

export function WalletButton({ className }: { className?: string }) {
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const onChain = wallet.address && wallet.chainId === 1874

  const connect = async () => {
    setBusy(true)
    try {
      await (onChain ? chooseWallet() : connectWallet())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't connect")
    }
    setBusy(false)
  }

  const label = onChain
    ? short(wallet.address as string)
    : wallet.address
      ? "Switch to Whitechain"
      : "Connect wallet"

  return (
    <Button
      variant="pill-outline"
      size="pill-sm"
      className={className}
      disabled={busy}
      onClick={connect}
    >
      {busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <WalletIcon data-icon="inline-start" />
      )}
      {label}
    </Button>
  )
}
