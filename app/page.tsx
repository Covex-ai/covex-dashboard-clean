// Redirect root -> /login (auth-first)
import { redirect } from "next/navigation";
export default function Page() {
  redirect("/login");
}
