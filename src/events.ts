export class TypedEventEmitter<Events extends Record<string, unknown>> {
  private readonly handlers = new Map<
    keyof Events,
    Set<(event: Events[keyof Events]) => void>
  >();

  on<Name extends keyof Events>(
    name: Name,
    handler: (event: Events[Name]) => void,
  ): () => void {
    const existing =
      this.handlers.get(name) ??
      new Set<(event: Events[keyof Events]) => void>();
    existing.add(handler as (event: Events[keyof Events]) => void);
    this.handlers.set(name, existing);
    return () =>
      existing.delete(handler as (event: Events[keyof Events]) => void);
  }

  emit<Name extends keyof Events>(name: Name, event: Events[Name]): void {
    for (const handler of this.handlers.get(name) ?? []) handler(event);
  }

  clear(): void {
    this.handlers.clear();
  }
}
