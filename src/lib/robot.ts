export default class Robot {
  serialNumber: string;
  name: string;
  model?: string | null;
  notes?: string | null;

  constructor(opts: { serialNumber: string; name: string; model?: string | null; notes?: string | null }) {
    this.serialNumber = opts.serialNumber;
    this.name = opts.name;
    this.model = opts.model ?? null;
    this.notes = opts.notes ?? null;
  }

  toJSON() {
    return {
      serialNumber: this.serialNumber,
      name: this.name,
      model: this.model,
      notes: this.notes,
    };
  }

  static fromJSON(obj: any) {
    return new Robot({
      serialNumber: obj.serialNumber || '',
      name: obj.name || '',
      model: obj.model ?? null,
      notes: obj.notes ?? null,
    });
  }
}