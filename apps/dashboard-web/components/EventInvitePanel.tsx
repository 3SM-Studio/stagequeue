"use client"

import { QRCodeSVG } from "qrcode.react"
import { useCallback, useEffect, useState } from "react"
import {
  DashboardApiError,
  getDashboardEventInvite,
  type DashboardInvite,
  type DashboardJoinAccessMode,
  revokeDashboardEventInvite,
  rotateDashboardEventInvite
} from "../lib/apiClient"
import { copyInviteUrl } from "../lib/eventInviteClipboard"

type InvitePanelState =
  | { kind: "loading" }
  | { kind: "ready"; invite: DashboardInvite | null }
  | { kind: "error"; message: string }

type PendingAction = "rotate" | "revoke" | null
type CopyState = "idle" | "copied" | "failed" | "unavailable"

export function EventInvitePanel({
  eventId,
  joinAccessMode,
  publicJoinEnabled
}: {
  eventId: string
  joinAccessMode: DashboardJoinAccessMode
  publicJoinEnabled: boolean
}) {
  const [state, setState] = useState<InvitePanelState>({ kind: "loading" })
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [copyState, setCopyState] = useState<CopyState>("idle")
  const [actionError, setActionError] = useState<string | null>(null)
  const [revokedNotice, setRevokedNotice] = useState(false)

  const loadInvite = useCallback(async () => {
    setState({ kind: "loading" })
    try {
      const response = await getDashboardEventInvite(eventId)
      setState({ kind: "ready", invite: response.invite })
    } catch (error) {
      setState({ kind: "error", message: getInviteErrorMessage(error) })
    }
  }, [eventId])

  useEffect(() => {
    void loadInvite()
  }, [loadInvite])

  const rotate = async () => {
    const currentInvite = state.kind === "ready" ? state.invite : null
    if (
      currentInvite &&
      !window.confirm("Wygenerowanie nowego kodu unieważni obecny link dla nowych wejść. Kontynuować?")
    ) {
      return
    }

    setPendingAction("rotate")
    setActionError(null)
    setCopyState("idle")
    try {
      const response = await rotateDashboardEventInvite(eventId)
      setState({ kind: "ready", invite: response.invite })
      setRevokedNotice(false)
    } catch (error) {
      setActionError(getInviteErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  const revoke = async () => {
    if (!window.confirm("Unieważnić ten kod dla wszystkich nowych wejść?")) {
      return
    }

    setPendingAction("revoke")
    setActionError(null)
    setCopyState("idle")
    try {
      const response = await revokeDashboardEventInvite(eventId)
      setState({ kind: "ready", invite: response.invite })
      setRevokedNotice(true)
    } catch (error) {
      setActionError(getInviteErrorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  const copy = async () => {
    if (state.kind !== "ready" || !state.invite) {
      return
    }
    setCopyState(await copyInviteUrl(state.invite.inviteUrl))
  }

  return (
    <EventInvitePanelView
      actionError={actionError}
      copyState={copyState}
      joinAccessMode={joinAccessMode}
      onCopy={copy}
      onRetry={loadInvite}
      onRevoke={revoke}
      onRotate={rotate}
      pendingAction={pendingAction}
      publicJoinEnabled={publicJoinEnabled}
      revokedNotice={revokedNotice}
      state={state}
    />
  )
}

export function EventInvitePanelView({
  actionError,
  copyState,
  joinAccessMode,
  onCopy,
  onRetry,
  onRevoke,
  onRotate,
  pendingAction,
  publicJoinEnabled,
  revokedNotice,
  state
}: {
  actionError: string | null
  copyState: CopyState
  joinAccessMode: DashboardJoinAccessMode
  onCopy: () => void
  onRetry: () => void
  onRevoke: () => void
  onRotate: () => void
  pendingAction: PendingAction
  publicJoinEnabled: boolean
  revokedNotice: boolean
  state: InvitePanelState
}) {
  const invite = state.kind === "ready" ? state.invite : null
  const busy = pendingAction !== null

  return (
    <section className="panel event-invite-panel" aria-labelledby="event-invite-heading">
      <div className="event-invite-heading">
        <div>
          <p className="muted">Dostęp dla gości</p>
          <h2 id="event-invite-heading">Kod QR wydarzenia</h2>
        </div>
        {invite ? <span className="status-badge status-active">Aktywny</span> : null}
      </div>

      <p>Pokaż ten kod QR w lokalu. Goście po zeskanowaniu otrzymają dostęp do dodawania zgłoszeń.</p>
      {joinAccessMode === "invite_required" ? (
        <p className="notice warning">Bez kodu QR gość zobaczy wydarzenie, ale nie doda zgłoszenia.</p>
      ) : null}
      {!publicJoinEnabled ? (
        <p className="notice warning">Zgłoszenia są obecnie wyłączone. Kod nie otworzy formularza do czasu ich włączenia.</p>
      ) : null}

      {state.kind === "loading" ? <p className="muted">Pobieranie aktywnego kodu...</p> : null}

      {state.kind === "error" ? (
        <div className="notice error" role="alert">
          <span>{state.message}</span>
          <button className="button secondary compact" type="button" onClick={onRetry}>
            Spróbuj ponownie
          </button>
        </div>
      ) : null}

      {invite ? (
        <div className="event-invite-active">
          <div className="event-invite-qr">
            <QRCodeSVG
              aria-label="Kod QR zaproszenia do wydarzenia"
              bgColor="#ffffff"
              fgColor="#111111"
              level="M"
              role="img"
              size={240}
              title="Kod QR zaproszenia do wydarzenia"
              value={invite.inviteUrl}
            />
          </div>
          <div className="event-invite-details">
            <label htmlFor="event-invite-url">Link zaproszenia</label>
            <input
              id="event-invite-url"
              readOnly
              type="url"
              value={invite.inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <a className="inline-link" href={invite.inviteUrl} rel="noreferrer" target="_blank">
              Otwórz stronę zaproszenia
            </a>
            {invite.expiresAt ? <p className="muted">Wygasa: {formatInviteExpiry(invite.expiresAt)}</p> : null}
            <div className="event-invite-actions">
              <button className="button compact" disabled={busy} type="button" onClick={onCopy}>
                Kopiuj link
              </button>
              <button className="button secondary compact" disabled={busy} type="button" onClick={onRotate}>
                {pendingAction === "rotate" ? "Generowanie..." : "Wygeneruj nowy kod"}
              </button>
              <button className="button danger compact" disabled={busy} type="button" onClick={onRevoke}>
                {pendingAction === "revoke" ? "Unieważnianie..." : "Unieważnij kod"}
              </button>
            </div>
            <CopyFeedback state={copyState} />
          </div>
        </div>
      ) : null}

      {state.kind === "ready" && !invite ? (
        <div className="event-invite-empty">
          <p className="muted">To wydarzenie nie ma aktywnego kodu zaproszenia.</p>
          <button className="button compact" disabled={busy} type="button" onClick={onRotate}>
            {pendingAction === "rotate" ? "Generowanie..." : "Wygeneruj nowy kod"}
          </button>
        </div>
      ) : null}

      {revokedNotice ? (
        <p className="notice warning" role="status">
          Nowe wejścia przez ten kod są zablokowane. Osoby, które już uzyskały dostęp, mogą nadal mieć aktywny
          dostęp w tej przeglądarce.
        </p>
      ) : null}

      {actionError ? (
        <p className="notice error" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  )
}

function CopyFeedback({ state }: { state: CopyState }) {
  if (state === "idle") {
    return null
  }

  const message =
    state === "copied"
      ? "Link skopiowany."
      : state === "unavailable"
        ? "Automatyczne kopiowanie jest niedostępne. Zaznacz link powyżej."
        : "Nie udało się skopiować linku. Zaznacz go powyżej."

  return (
    <p className={state === "copied" ? "notice success" : "notice warning"} role="status">
      {message}
    </p>
  )
}

function getInviteErrorMessage(error: unknown): string {
  if (error instanceof DashboardApiError && error.status === 403) {
    return "Nie masz uprawnień do zarządzania kodem zaproszenia."
  }

  return "Nie udało się pobrać lub zmienić kodu zaproszenia. Spróbuj ponownie."
}

function formatInviteExpiry(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pl-PL")
}
