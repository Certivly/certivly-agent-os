import { RuntimeObservation } from '../models/RuntimeObservation';

export class ObservationEngine {
  private observations: RuntimeObservation[] = [];

  public observe(type: string, source: string, details: any): RuntimeObservation {
    const obs = { type, source, details };
    this.observations.push(obs);
    return obs;
  }

  public getRecentObservations(): RuntimeObservation[] {
    return [...this.observations];
  }

  public clear() {
    this.observations = [];
  }
}
