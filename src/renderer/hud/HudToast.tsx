import { Toast } from '../shared/components/Toast.js';

export function HudToast({ text }: { text: string | null }): React.JSX.Element {
  return <Toast text={text} />;
}
