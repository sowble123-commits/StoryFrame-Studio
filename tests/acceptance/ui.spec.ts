import { expect, test } from "vitest"; import { useStoryFrameStore } from "../../src/store"; test("ui test", () => { const store = useStoryFrameStore.getState(); expect(store.project).toBeNull(); });
