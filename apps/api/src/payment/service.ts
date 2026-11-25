import { PaymentError, PgPaymentRepository } from './repository.js';
import type { PaymentProvider, PaymentProviderName } from './providers.js';

export { PaymentError };

export class PaymentService {
  private readonly providers: ReadonlyMap<PaymentProviderName, PaymentProvider>;
  constructor(private readonly payments: PgPaymentRepository, providers: PaymentProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  async pay(customerId: string, bookingId: string, providerName: PaymentProviderName, idempotencyKey: string) {
    const provider = this.providers.get(providerName);
    if (!provider) throw new PaymentError('PAYMENT_NOT_FOUND');
    const prepared = await this.payments.prepare(customerId, bookingId, providerName, idempotencyKey);
    if (!prepared.shouldCharge) return prepared.attempt;
    let providerReference: string;
    try {
      const result = await provider.charge({ bookingId, amountCents: prepared.context!.amountCents, idempotencyKey });
      providerReference = result.providerReference;
    } catch {
      return this.payments.complete(prepared.attempt, 'failed', null);
    }
    return this.payments.complete(prepared.attempt, 'succeeded', providerReference);
  }
}
