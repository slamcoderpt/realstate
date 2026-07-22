'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {useRouter} from '@/i18n/navigation';
import {createClient} from '@/lib/supabase/client';
import {createUploadUrlAction, registerMediaAction} from './actions';
import {Input} from '@/components/ui/input';
import type {Locale} from '@/lib/mail/templates';

/**
 * Upload direto ao Storage em três passos: (1) o servidor assina uma URL de
 * upload depois de confirmar staff, (2) o browser envia os bytes ao Storage —
 * vídeos excedem o limite de corpo de uma Server Action —, (3) o servidor
 * regista a linha em `work_update_media`. Como os bytes não passam pelo
 * servidor, quem impõe tipo e tamanho é o bucket `work-media`.
 *
 * Componente de cliente: não importar nada `server-only`. O nome do bucket é
 * literal por isso mesmo (`WORK_MEDIA_BUCKET` vive em `lib/works/storage`).
 */

const BUCKET = 'work-media';
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

export function MediaUploader({
  locale,
  projectId,
  updateId
}: {
  locale: Locale;
  projectId: string;
  updateId: string;
}) {
  const t = useTranslations('WorksAdmin');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await createUploadUrlAction(updateId, file.name, file.type);
      if ('error' in res) throw new Error(res.error);
      const supabase = createClient();
      const {error} = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(res.path, res.token, file);
      if (error) throw error;
      await registerMediaAction(
        locale,
        projectId,
        updateId,
        res.path,
        file.type,
        file.size
      );
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  return (
    <div className="space-y-1.5 border-t border-border pt-4">
      <Input
        type="file"
        accept={ACCEPT}
        aria-label={t('addMedia')}
        onChange={onPick}
        disabled={busy}
        className="max-w-md"
      />
      <p className="text-xs text-ink-muted">{t('mediaHint')}</p>
      {busy && (
        <p className="text-xs font-semibold text-brand-600">{t('uploading')}</p>
      )}
      {failed && (
        <p role="alert" className="text-xs font-semibold text-destructive">
          {t('uploadFailed')}
        </p>
      )}
    </div>
  );
}
