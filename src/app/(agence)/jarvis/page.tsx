import { requireStaff } from "@/lib/auth";
import { secretStatus } from "@/lib/secrets";
import { JarvisChat } from "./JarvisChat";

export const dynamic = "force-dynamic";

/** Jarvis : le directeur marketing IA, à qui l'on parle (ou écrit) comme à un collaborateur. */
export default async function JarvisPage() {
  const user = await requireStaff();
  const ai = await secretStatus("anthropic");
  return <JarvisChat firstName={user.name.split(" ")[0]} ready={ai.connected} />;
}
