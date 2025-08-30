// Payment environment configuration utility
export interface PaymentConfig {
  apiKey: string;
  trialProductId: string;
  paymentUrl: string;
  basicProductId: string;
  proProductId: string;
}

export function getPaymentConfig(): PaymentConfig {
  const paymentEnv = process.env.PAYMENT_ENV || 'test';
  
  if (paymentEnv === 'production') {
    return {
      apiKey: process.env.CREEM_PROD_API_KEY || process.env.CREEM_API_KEY || '',
      trialProductId: process.env.CREEM_PROD_TRIAL_PRODUCT_ID || process.env.CREEM_TRIAL_PRODUCT_ID || '',
      basicProductId: process.env.CREEM_PROD_BASIC_PRODUCT_ID || process.env.CREEM_BASIC_PRODUCT_ID || '',
      proProductId: process.env.CREEM_PROD_PRO_PRODUCT_ID || process.env.CREEM_PRO_PRODUCT_ID || '',
      paymentUrl: process.env.CREEM_PROD_PAYMENT_URL || process.env.CREEM_PAYMENT_URL || 'https://creem.io/checkout',
    };
  }
  
  // Default to test environment
  return {
    apiKey: process.env.CREEM_TEST_API_KEY || process.env.CREEM_API_KEY || '',
    trialProductId: process.env.CREEM_TEST_TRIAL_PRODUCT_ID || process.env.CREEM_TRIAL_PRODUCT_ID || '',
    basicProductId: process.env.CREEM_TEST_BASIC_PRODUCT_ID || process.env.CREEM_BASIC_PRODUCT_ID || '',
    proProductId: process.env.CREEM_TEST_PRO_PRODUCT_ID || process.env.CREEM_PRO_PRODUCT_ID || '',
    paymentUrl: process.env.CREEM_TEST_PAYMENT_URL || process.env.CREEM_PAYMENT_URL || 'https://test.creem.io/checkout',
  };
}

export function getPaymentEnvironment(): 'test' | 'production' {
  return (process.env.PAYMENT_ENV === 'production') ? 'production' : 'test';
}

export function isProductionPayment(): boolean {
  return getPaymentEnvironment() === 'production';
}