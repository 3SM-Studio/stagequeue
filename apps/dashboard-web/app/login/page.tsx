import { redirect } from "next/navigation"

export const metadata = {
  title: "Logowanie"
}

export default function LoginPage() {
  redirect("/sign-in")
}
