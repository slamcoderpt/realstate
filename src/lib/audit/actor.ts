import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * Quem está a fazer a escrita, no âmbito de UMA ação.
 *
 * O `audit_row_change` grava `auth.uid()`, que é nulo em tudo o que passa por
 * service_role — ou seja, em todas as escritas da app. Para o log dizer quem,
 * o cliente admin envia o utilizador no cabeçalho `x-actor-id` e o trigger
 * usa-o (ver 20260729150000_audit_actor.sql). Falta o ator chegar cá.
 *
 * Só `run(cb)`. Duas alternativas mais baratas foram tentadas e medidas:
 *
 *  - `cache()` do React: não tem âmbito de pedido dentro de Server Actions,
 *    que é precisamente onde as escritas vivem. O ator perdia-se entre o
 *    `getSession()` e o `createAdminClient()` — o e2e apanhou-o duas vezes,
 *    incluindo com a caixa ancorada no `globalThis`.
 *  - `AsyncLocalStorage.enterWith()`: escapa para pedidos vizinhos. Com um
 *    servidor HTTP real e cinco pedidos concorrentes, 4 em 5 ficaram com o
 *    ator errado. Num registo de auditoria, atribuir a pessoa errada é pior
 *    do que não atribuir de todo.
 *
 * `run()` isola (medido: 5 em 5 concorrentes corretos), mas exige um envelope
 * à volta do trabalho — daí `asStaff`/`asAdmin` em `lib/auth/staff.ts`, que
 * toda a Server Action usa. É mais verboso do que um mecanismo ambiente, e é
 * essa a troca: uma ação que se esqueça do envelope fica sem autor, nunca com
 * o errado, e vê-se à vista no ficheiro.
 *
 * A instância vive no `globalThis` porque o Next carrega o módulo em mais do
 * que um bundle (Server Components e Server Actions): duas instâncias seriam
 * duas caixas.
 */
type ActorStore = {id: string};

const globalRef = globalThis as typeof globalThis & {
  __auditActorStore?: AsyncLocalStorage<ActorStore>;
};

const storage: AsyncLocalStorage<ActorStore> = (globalRef.__auditActorStore ??=
  new AsyncLocalStorage<ActorStore>());

/**
 * Ficam de fora, de propósito, cinco Server Actions — todas por não haver ator
 * para registar:
 *
 *  - pedir e completar a recuperação de palavra-passe, e aceitar um convite:
 *    correm sem sessão nenhuma (é esse o ponto);
 *  - listar as minhas notificações: não escreve;
 *  - mudar a palavra-passe: a única escrita é em `auth.users`, pela API de
 *    admin do GoTrue, que não passa pelo PostgREST nem tem trigger de
 *    auditoria.
 */

/** Corre `fn` com o ator marcado, para as escritas lá dentro o levarem. */
export function withAuditActor<T>(id: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({id}, fn);
}

export function getAuditActor(): string | null {
  return storage.getStore()?.id ?? null;
}
