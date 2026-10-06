/** 점으로 구분된 경로(`balance.damage.attackScale`, `teamA.0`)로 값을 읽는다. */
export function getIn(obj: unknown, path: string): unknown {
  let node: any = obj;
  for (const key of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = node[key];
  }
  return node;
}

/** 원본을 바꾸지 않고 경로의 값을 교체한 복사본을 돌려준다. 중간 객체가 없으면 만든다. */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const recurse = (node: any, i: number): any => {
    if (i === keys.length) return value;
    const key = keys[i];
    const copy = Array.isArray(node) ? [...node] : { ...(node ?? {}) };
    copy[key] = recurse(node?.[key], i + 1);
    return copy;
  };
  return recurse(obj, 0) as T;
}
