import { createHmac, randomBytes } from "node:crypto"
import type { FastifyReply, FastifyRequest } from "fastify"
import type { CookieSerializeOptions } from "@fastify/cookie"

export const PARTICIPANT_COOKIE_NAME = "pn_participant"
export const PARTICIPANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 120

const participantTokenPattern = /^[A-Za-z0-9_-]{32,128}$/

export function createParticipantToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashParticipantToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex")
}

export function isValidParticipantToken(value: string | undefined): value is string {
  return typeof value === "string" && participantTokenPattern.test(value)
}

export function resolveParticipantToken(request: FastifyRequest, reply: FastifyReply): string {
  const existing = request.cookies[PARTICIPANT_COOKIE_NAME]
  const token = isValidParticipantToken(existing) ? existing : createParticipantToken()

  const cookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: request.server.config.nodeEnv === "production",
    path: "/",
    maxAge: PARTICIPANT_COOKIE_MAX_AGE_SECONDS
  }
  if (request.server.config.cookieDomain !== undefined) {
    cookieOptions.domain = request.server.config.cookieDomain
  }

  reply.setCookie(PARTICIPANT_COOKIE_NAME, token, cookieOptions)

  return token
}
