export type PaymentRequest = {
  appointmentId: string;
  amountTzs: number;
  method: "mpesa" | "mixx" | "airtel" | "halopesa" | "card" | "sponsor";
  idempotencyKey: string;
};

export type PaymentResult = {
  adapterReference: string;
  status: "reserved" | "paid" | "failed";
  retryable: boolean;
};

export interface PaymentAdapter {
  reserve(request: PaymentRequest): Promise<PaymentResult>;
}

export class MockPaymentAdapter implements PaymentAdapter {
  async reserve(request: PaymentRequest): Promise<PaymentResult> {
    if (request.amountTzs <= 0) return { adapterReference: "mock_invalid", status: "failed", retryable: false };
    if (request.idempotencyKey.startsWith("fail_")) return { adapterReference: "mock_timeout", status: "failed", retryable: true };
    return { adapterReference: `mock_${request.idempotencyKey}`, status: "reserved", retryable: false };
  }
}

export interface NotificationAdapter {
  sendNeutralUpdate(deviceId: string, eventId: string): Promise<{ queued: boolean }>;
}

export class MockNotificationAdapter implements NotificationAdapter {
  async sendNeutralUpdate(_deviceId: string, _eventId: string): Promise<{ queued: boolean }> {
    return { queued: true };
  }
}

export interface BloodMatchAdapter {
  createAuthorizedHospitalBoundary(request: { hospitalId: string; opaqueEmergencyId: string }): Promise<{ accepted: boolean }>;
}

export class DisabledBloodMatchAdapter implements BloodMatchAdapter {
  async createAuthorizedHospitalBoundary(): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }
}
