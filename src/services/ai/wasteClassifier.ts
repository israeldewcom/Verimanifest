import axios from 'axios';
import { cacheService } from '../cache.service';
import logger from '../../config/logger';

export class WasteClassifierService {
  private apiKey: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.apiUrl =
      process.env.WASTE_CLASSIFICATION_API || 'https://api.openai.com/v1/chat/completions';
  }

  async classifyWaste(description: string): Promise<{
    primaryCode: string;
    secondaryCodes: string[];
    confidence: number;
    handlingInstructions: string;
    regulatoryInfo: any;
  }> {
    const cacheKey = cacheService.generateKey('waste', 'classify', description);
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) return cached;

    if (this.apiKey) {
      try {
        const result = await this.aiClassify(description);
        await cacheService.set(cacheKey, result, 86400);
        return result;
      } catch (error) {
        logger.error('AI classification failed, using rule-based fallback', { error });
      }
    }

    const result = this.ruleBasedClassify(description);
    await cacheService.set(cacheKey, result, 86400);
    return result;
  }

  private async aiClassify(description: string): Promise<any> {
    const response = await axios.post(
      this.apiUrl,
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an EPA waste classification expert. Classify the waste description into EPA waste codes. Return ONLY valid JSON with: primaryCode, secondaryCodes (array), confidence (0-1), handlingInstructions, regulatoryInfo: { epaClass, requiresSpecialPermit, transportRestrictions (array), disposalMethod }`,
          },
          { role: 'user', content: description },
        ],
        temperature: 0.1,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  }

  private ruleBasedClassify(description: string): any {
    let primaryCode = 'D001';
    let confidence = 0.7;
    const secondaryCodes: string[] = [];
    const lower = description.toLowerCase();

    if (lower.includes('medical') || lower.includes('sharps') || lower.includes('biohazard')) {
      primaryCode = 'MED001';
      confidence = 0.9;
    } else if (lower.includes('pharmaceutical') || lower.includes('pill') || lower.includes('drug')) {
      primaryCode = 'PHARMA001';
      confidence = 0.85;
    } else if (lower.includes('radioactive') || lower.includes('nuclear')) {
      primaryCode = 'RAD001';
      confidence = 0.95;
    } else if (lower.includes('solvent') || lower.includes('acetone') || lower.includes('paint')) {
      primaryCode = 'F001';
      confidence = 0.8;
      secondaryCodes.push('D001');
    } else if (lower.includes('acid') || lower.includes('corrosive')) {
      primaryCode = 'D002';
      confidence = 0.85;
    } else if (lower.includes('lead') || lower.includes('mercury') || lower.includes('cadmium')) {
      primaryCode = 'D008';
      confidence = 0.8;
    } else if (lower.includes('oil') || lower.includes('petroleum')) {
      primaryCode = 'D001';
      confidence = 0.75;
    }

    return {
      primaryCode,
      secondaryCodes,
      confidence,
      handlingInstructions: `Handle as ${primaryCode}. Follow EPA guidelines for ${this.getEpaClassName(primaryCode)} waste.`,
      regulatoryInfo: {
        epaClass: this.getEpaClassName(primaryCode),
        requiresSpecialPermit: ['P001', 'RAD001', 'MED001'].includes(primaryCode),
        transportRestrictions: this.getTransportRestrictions(primaryCode),
        disposalMethod: this.getDisposalMethod(primaryCode),
      },
    };
  }

  private getEpaClassName(code: string): string {
    const names: Record<string, string> = {
      D001: 'Ignitable',
      D002: 'Corrosive',
      D008: 'Toxic (Lead)',
      F001: 'Spent Halogenated Solvents',
      MED001: 'Medical/Biohazard',
      PHARMA001: 'Pharmaceutical',
      RAD001: 'Radioactive',
    };
    return names[code] || 'General';
  }

  private getTransportRestrictions(code: string): string[] {
    const restrictions: Record<string, string[]> = {
      RAD001: ['DOT Class 7', 'Placarding required', 'Route restrictions apply'],
      MED001: ['UN3291', 'Biohazard labeling required'],
      D001: ['DOT Class 3', 'Flammable placard required'],
    };
    return restrictions[code] || [];
  }

  private getDisposalMethod(code: string): string {
    const methods: Record<string, string> = {
      RAD001: 'Licensed radioactive waste disposal facility',
      MED001: 'Medical waste incinerator or autoclave',
      D001: 'Hazardous waste incinerator or fuel blending',
      D002: 'Neutralization followed by approved landfill',
    };
    return methods[code] || 'Appropriate permitted facility';
  }
}

export const wasteClassifier = new WasteClassifierService();
