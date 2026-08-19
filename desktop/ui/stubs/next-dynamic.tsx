import React from 'react';

type Importer = () => Promise<Record<string, unknown>>;

export default function dynamic(
  importer: Importer,
  opts?: { ssr?: boolean; loading?: () => React.ReactNode }
) {
  const Lazy = React.lazy(async () => {
    const mod = await importer();
    const Comp = (mod.default ?? Object.values(mod).find((v) => typeof v === 'function')) as
      | React.ComponentType<unknown>
      | undefined;
    if (!Comp) throw new Error('dynamic() module has no component export');
    return { default: Comp };
  });
  return function DynamicComponent(props: Record<string, unknown>) {
    return (
      <React.Suspense fallback={opts?.loading ? opts.loading() : null}>
        <Lazy {...props} />
      </React.Suspense>
    );
  };
}
