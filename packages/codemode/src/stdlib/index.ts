export * from './collections';
export * from './strings';
export * from './math';
export * from './json';
export * from './promises';
export * from './date';
export * from './url';
export * from './value';
export * from './console';
export * from './number';
export * from './object';
export * from './regexp';

import { Collections } from './collections';
import { Strings } from './strings';
import { MathUtils } from './math';
import { JsonUtils } from './json';
import { PromiseUtils } from './promises';
import { DateUtils } from './date';
import { UrlUtils } from './url';
import { ValueUtils } from './value';
import { ConsoleUtils } from './console';
import { NumberUtils } from './number';
import { ObjectUtils } from './object';
import { RegExpUtils } from './regexp';

export const stdlib = {
  collections: Collections,
  strings: Strings,
  math: MathUtils,
  json: JsonUtils,
  promises: PromiseUtils,
  date: DateUtils,
  url: UrlUtils,
  value: ValueUtils,
  console: new ConsoleUtils(),
  number: NumberUtils,
  object: ObjectUtils,
  regexp: RegExpUtils,
};
