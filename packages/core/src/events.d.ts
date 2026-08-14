export declare class TypedEventEmitter<Events extends Record<string, unknown>> {
  private readonly handlers;
  on<Name extends keyof Events>(
    name: Name,
    handler: (event: Events[Name]) => void,
  ): () => void;
  emit<Name extends keyof Events>(name: Name, event: Events[Name]): void;
  clear(): void;
}
//# sourceMappingURL=events.d.ts.map
