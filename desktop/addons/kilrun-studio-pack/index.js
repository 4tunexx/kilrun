/** Kilrun Engine example addon — Engine Pack (theme + home extras). */
export default function activate(Kilrun) {
  Kilrun.theme.register({
    id: 'studio-night',
    name: 'Studio Night',
    vars: {
      '--kilrun-accent': '#f87171',
      '--kilrun-shell-bg': '#080b12',
    },
  });
  Kilrun.engine.registerHomeCard({
    id: 'studio-welcome',
    title: 'Studio Pack',
    body: 'This Addon is an Engine Pack. Publish it as official and every linked Engine client picks it up on launch — no Setup.exe rebuild.',
  });
}
