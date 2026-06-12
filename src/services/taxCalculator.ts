import { environment } from '../config/environment';
import { cacheService } from './cache.service';
import logger from '../config/logger';
import { AppError } from '../utils/AppError';

interface TaxCalculationInput {
  amount: number;
  fromState: string;
  toState: string;
  wasteType: string;
  wasteClassification: string;
}

interface TaxCalculationResult {
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  taxDetails: any[];
  appliedTaxes: string[];
}

class TaxCalculator {
  private avalaraClient: any = null;
  private taxjarClient: any = null;
  private useAvalara = false;
  private useTaxJar = false;

  constructor() {
    if (environment.AVALARA_ACCOUNT_ID && environment.AVALARA_LICENSE_KEY) {
      this.useAvalara = true;
      logger.info('Avalara tax service configured');
    }
    if (environment.TAXJAR_API_KEY) {
      this.useTaxJar = true;
      logger.info('TaxJar service configured');
    }
  }

  async calculateTax(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    const cacheKey = cacheService.generateKey(
      'tax',
      input.fromState,
      input.toState,
      input.wasteType,
      input.wasteClassification,
      input.amount.toString()
    );

    const cached = await cacheService.get<TaxCalculationResult>(cacheKey);
    if (cached) return cached;

    let result: TaxCalculationResult;

    try {
      if (this.useAvalara) {
        result = await this.calculateAvalaraTax(input);
      } else if (this.useTaxJar) {
        result = await this.calculateTaxJarTax(input);
      } else {
        result = this.calculateFallbackTax(input);
      }

      await cacheService.set(cacheKey, result, 1800);
      return result;
    } catch (error) {
      logger.error('Tax calculation failed, using fallback', { error });
      result = this.calculateFallbackTax(input);
      await cacheService.set(cacheKey, result, 1800);
      return result;
    }
  }

  private async calculateAvalaraTax(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    const Avalara = require('@avaldax/avatax');
    const client = new Avalara({
      accountId: environment.AVALARA_ACCOUNT_ID,
      licenseKey: environment.AVALARA_LICENSE_KEY,
    });

    const taxResult = await client.createTransaction({
      type: 'SalesOrder',
      companyCode: 'DEFAULT',
      date: new Date().toISOString().split('T')[0],
      lines: [
        {
          amount: input.amount,
          itemCode: `WASTE_${input.wasteClassification.toUpperCase()}`,
          description: `Waste transport: ${input.wasteType}`,
        },
      ],
      addresses: {
        ShipFrom: { region: input.fromState, country: 'US' },
        ShipTo: { region: input.toState, country: 'US' },
      },
    });

    return {
      subtotal: input.amount,
      taxAmount: taxResult.totalTax || 0,
      total: taxResult.totalAmount || input.amount,
      taxRate: taxResult.totalTaxRate || 0,
      taxDetails: taxResult.lines?.[0]?.details || [],
      appliedTaxes: taxResult.summary?.map((s: any) => s.taxName) || [],
    };
  }

  private async calculateTaxJarTax(input: TaxCalculationInput): Promise<TaxCalculationResult> {
    const TaxJar = require('taxjar');
    const client = new TaxJar({ apiKey: environment.TAXJAR_API_KEY });

    const taxResult = await client.taxForOrder({
      from_country: 'US',
      from_state: input.fromState,
      to_country: 'US',
      to_state: input.toState,
      amount: input.amount,
      shipping: 0,
      line_items: [
        {
          id: '1',
          quantity: 1,
          unit_price: input.amount,
          product_tax_code: this.getTaxCode(input.wasteClassification),
        },
      ],
    });

    return {
      subtotal: input.amount,
      taxAmount: taxResult.amount_to_collect || 0,
      total: (input.amount + (taxResult.amount_to_collect || 0)),
      taxRate: taxResult.rate || 0,
      taxDetails: taxResult.breakdown?.line_items || [],
      appliedTaxes: ['sales_tax'],
    };
  }

  private calculateFallbackTax(input: TaxCalculationInput): TaxCalculationResult {
    const standardRate = 0.05;
    const interstateMultiplier = input.fromState !== input.toState ? 1.2 : 1;
    const hazardousSurcharge = input.wasteClassification === 'hazardous' ? 0.03 : 0;
    
    const effectiveRate = standardRate * interstateMultiplier + hazardousSurcharge;
    const taxAmount = Math.round(input.amount * effectiveRate * 100) / 100;

    return {
      subtotal: input.amount,
      taxAmount,
      total: input.amount + taxAmount,
      taxRate: effectiveRate,
      taxDetails: [],
      appliedTaxes: ['estimated_sales_tax'],
    };
  }

  private getTaxCode(classification: string): string {
    const taxCodes: Record<string, string> = {
      hazardous: '30070',
      'non-hazardous': '30071',
      medical: '30072',
      universal: '30073',
      radioactive: '30074',
    };
    return taxCodes[classification] || '30070';
  }
}

export const taxCalculator = new TaxCalculator();
