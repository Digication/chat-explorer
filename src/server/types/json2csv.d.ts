declare module "json2csv" {
  export class Parser<T = unknown> {
    constructor(opts?: { fields?: string[] });
    parse(data: T[]): string;
  }
}
