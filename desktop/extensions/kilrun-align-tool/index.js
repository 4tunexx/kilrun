/** Kilrun Engine example extension — editor tools, never live-server code. */
export default function activate(Kilrun) {
  function selectedEntities(ctx) {
    const doc = ctx.getDoc() || {};
    const entities = Array.isArray(doc.entities) ? doc.entities : [];
    const ids = (ctx.selectedIds && ctx.selectedIds()) || [];
    const wanted = ids.length ? ids : ctx.selectedId() ? [ctx.selectedId()] : [];
    return wanted.map((id) => entities.find((ent) => ent && ent.id === id)).filter(Boolean);
  }

  function alignAxis(axis, ctx) {
    const picked = selectedEntities(ctx);
    if (picked.length < 2) {
      ctx.toast({
        title: 'Select two or more objects',
        description: 'Align uses the first selected object as the anchor.',
      });
      return;
    }
    const anchor = picked[0].position || [0, 0, 0];
    ctx.mutateDoc((doc) => {
      const ids = new Set(picked.map((ent) => ent.id));
      return {
        ...doc,
        entities: (doc.entities || []).map((ent) => {
          if (!ids.has(ent.id) || ent.id === picked[0].id) return ent;
          const position = Array.isArray(ent.position) ? ent.position.slice() : [0, 0, 0];
          position[axis] = anchor[axis];
          return { ...ent, position };
        }),
      };
    });
    ctx.toast({ title: axis === 1 ? 'Flattened Y' : `Aligned ${axis === 0 ? 'X' : 'Z'}` });
  }

  Kilrun.tools.register({
    id: 'align-x',
    label: 'Align X',
    order: 210,
    onActivate(ctx) {
      alignAxis(0, ctx);
    },
  });
  Kilrun.tools.register({
    id: 'flatten-y',
    label: 'Flat Y',
    order: 211,
    onActivate(ctx) {
      alignAxis(1, ctx);
    },
  });
  Kilrun.tools.register({
    id: 'align-z',
    label: 'Align Z',
    order: 212,
    onActivate(ctx) {
      alignAxis(2, ctx);
    },
  });
}
