export type PaymentProviderName = 'stripe' | 'paypal';
export type ChargeInput = { bookingId: string; amountCents: number; idempotencyKey: string };
export type ChargeResult = { providerReference: string };

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  charge(input: ChargeInput): Promise<ChargeResult>;
}

abstract class SuccessfulMockProvider implements PaymentProvider {
  abstract readonly name: PaymentProviderName;

  async charge(input: ChargeInput): Promise<ChargeResult> {
    return { providerReference: `${this.name}_mock_${input.bookingId.slice(0, 8)}_${input.idempotencyKey.slice(0, 8)}` };
  }
}

export class MockStripeProvider extends SuccessfulMockProvider { readonly name = 'stripe' as const; }
export class MockPayPalProvider extends SuccessfulMockProvider { readonly name = 'paypal' as const; }
