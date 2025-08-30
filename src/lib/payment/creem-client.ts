// Real Creem.io payment client
import { CreateCheckoutRequest, CreateCheckoutResponse } from './types';
import { getPaymentConfig } from './config';

/**
 * Creem Payment Client
 * Based on Creem.io API documentation from creem.md
 */
export class CreemPaymentClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    const config = getPaymentConfig();
    this.apiKey = apiKey || config.apiKey;
    
    // Determine API base URL based on environment
    if (config.paymentUrl.includes('test') || this.apiKey.includes('test')) {
      this.baseUrl = 'https://test-api.creem.io/v1';
    } else {
      this.baseUrl = 'https://api.creem.io/v1';
    }
    
    console.log('CreemPaymentClient initialized:', {
      hasApiKey: !!this.apiKey,
      apiKeyPrefix: this.apiKey.substring(0, 10) + '...',
      baseUrl: this.baseUrl
    });
    
    if (!this.apiKey) {
      throw new Error('Creem API key is required');
    }
  }

  /**
   * Create a Creem checkout session
   * Based on Creem.io API documentation
   * 
   * @param request - Checkout request parameters
   * @param request.product_id - Required product ID
   * @param request.request_id - Optional request ID for tracking
   * @param request.success_url - Optional success redirect URL
   * @param request.customer - Optional customer info with email
   * @param request.metadata - Optional metadata object
   * @param request.discount_code - Optional discount code
   * @param request.units - Optional number of units to purchase
   * @param request.locale - Optional locale (e.g., "zh-CN", "en")
   * @param request.plan_type - Optional plan type identifier
   * @returns Promise<CreateCheckoutResponse>
   */
  async createCheckout(request: CreateCheckoutRequest): Promise<CreateCheckoutResponse> {
    // Validate required parameters
    if (!request.product_id) {
      throw new Error('product_id is required');
    }

    // Build request body according to creem.md specifications
    const requestBody: any = {
      product_id: request.product_id,
    };
    
    // Add optional parameters if provided
    if (request.request_id) {
      requestBody.request_id = request.request_id;
    }
    
    if (request.success_url) {
      requestBody.success_url = request.success_url;
    }
    
    if (request.customer?.email) {
      requestBody.customer = {
        email: request.customer.email
      };
    }
    
    if (request.metadata && Object.keys(request.metadata).length > 0) {
      requestBody.metadata = request.metadata;
    }
    
    if (request.discount_code) {
      requestBody.discount_code = request.discount_code;
    }
    
    if (request.units) {
      requestBody.units = request.units;
    }
    
    if (request.locale) {
      requestBody.locale = request.locale;
    }
    
    if (request.plan_type) {
      requestBody.plan_type = request.plan_type;
    }
    
    console.log('Creem API request details:', {
      url: `${this.baseUrl}/checkouts`,
      method: 'POST',
      body: requestBody
    });

    try {
      const response = await fetch(`${this.baseUrl}/checkouts`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Creem API response status:', response.status);
      console.log('Creem API response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        let errorData;
        const responseText = await response.text();
        console.log('Creem API error response text:', responseText);
        
        try {
          errorData = JSON.parse(responseText);
        } catch {
          errorData = { message: responseText || 'Unknown error' };
        }
        
        throw new Error(`Creem API error: ${response.status} - ${errorData.message || errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      console.log('Creem API response data:', data);
      
      // Use the payment URL from the API response if available
      // Otherwise construct it using the checkout ID and config
      let paymentUrl: string;
      
      if (data.payment_url || data.url || data.checkout_url) {
        // Use the URL provided by the API
        paymentUrl = data.payment_url || data.url || data.checkout_url;
      } else {
        // Fallback to constructing the URL (this might need adjustment based on actual Creem API response)
        const config = getPaymentConfig();
        paymentUrl = `${config.paymentUrl}/${data.id}`;
        console.warn('No payment URL in API response, using constructed URL:', paymentUrl);
      }
      
      return {
        checkout_id: data.id,
        payment_url: paymentUrl,
        status: data.status || 'pending',
      };
    } catch (error) {
      console.error('Creem checkout creation failed:', error);
      throw error;
    }
  }

  /**
   * Create a simple checkout with minimal parameters
   * @param productId - The product ID to purchase
   * @param requestId - Optional request ID for tracking
   * @param userEmail - Optional user email to pre-fill
   * @returns Promise<CreateCheckoutResponse>
   */
  async createSimpleCheckout(
    productId: string, 
    requestId?: string,
    userEmail?: string
  ): Promise<CreateCheckoutResponse> {
    const request: CreateCheckoutRequest = {
      product_id: productId,
      request_id: requestId,
      ...(userEmail && { customer: { email: userEmail } })
    };
    
    return this.createCheckout(request);
  }

  /**
   * Create a checkout with metadata and tracking parameters
   * @param productId - The product ID to purchase
   * @param options - Additional checkout options
   * @returns Promise<CreateCheckoutResponse>
   */
  async createCheckoutWithOptions(
    productId: string,
    options: {
      requestId?: string;
      successUrl?: string;
      userEmail?: string;
      metadata?: Record<string, any>;
      discountCode?: string;
      units?: number;
      locale?: string;
      planType?: string;
    }
  ): Promise<CreateCheckoutResponse> {
    const request: CreateCheckoutRequest = {
      product_id: productId,
      request_id: options.requestId,
      success_url: options.successUrl,
      ...(options.userEmail && { customer: { email: options.userEmail } }),
      metadata: options.metadata,
      discount_code: options.discountCode,
      units: options.units,
      locale: options.locale,
      plan_type: options.planType
    };
    
    return this.createCheckout(request);
  }


  // 获取 checkout 状态（用于验证支付）
  async getCheckoutStatus(checkoutId: string, successUrl?: string): Promise<any> {
    try {
      console.log('Getting checkout status for:', checkoutId);
      console.log('Using API base URL:', this.baseUrl);
      
      // 构建查询参数
      const params = new URLSearchParams();
      params.append('checkout_id', checkoutId);
      if (successUrl) {
        params.append('success_url', successUrl);
      }
      
      const response = await fetch(`${this.baseUrl}/checkouts?${params.toString()}`, {
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Creem API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('Checkout status response:', data);
      
      return data;
    } catch (error) {
      console.error('Failed to get checkout status:', error);
      throw error;
    }
  }
}

export const createCreemPaymentClient = () => {
  return new CreemPaymentClient();
};