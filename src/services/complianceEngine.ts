import prisma from '../config/database';
import { cacheService } from './cache.service';
import { insuranceVerification } from './insuranceVerification';
import { notificationService } from './notification.service';
import { complianceViolationsCounter } from '../config/metrics';
import logger from '../config/logger';
import { environment } from '../config/environment';
import { addDays, differenceInDays } from 'date-fns';

interface ComplianceResult {
  compliant: boolean;
  violations: string[];
  warnings: string[];
  suggestions: string[];
}

class ComplianceEngine {
  async validateManifest(manifestId: string): Promise<ComplianceResult> {
    const manifest = await prisma.manifest.findUnique({
      where: { id: manifestId },
      include: {
        generator: true,
        transporter: true,
        facility: true,
        signatures: true,
      },
    });

    if (!manifest) {
      throw new Error(`Manifest not found: ${manifestId}`);
    }

    const violations: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (!manifest.generator.epaId) {
      violations.push('Generator lacks EPA ID');
      complianceViolationsCounter.inc({ type: 'missing_epa_id' });
    }
    if (!manifest.transporter.epaId) {
      violations.push('Transporter lacks EPA ID');
      complianceViolationsCounter.inc({ type: 'missing_epa_id' });
    }
    if (!manifest.facility.epaId) {
      violations.push('Facility lacks EPA ID');
      complianceViolationsCounter.inc({ type: 'missing_epa_id' });
    }

    if (
      manifest.generator.state !== manifest.facility.state &&
      !manifest.transporter.interstateAuthorized
    ) {
      violations.push('Transporter not authorized for interstate transport');
      complianceViolationsCounter.inc({ type: 'interstate_unauthorized' });
    }

    const hasInsurance = await insuranceVerification.blockDispatchWithoutInsurance(
      manifest.transporterId
    );
    if (!hasInsurance && ['transport_accepted', 'in_transit'].includes(manifest.status)) {
      violations.push('Transporter lacks active insurance');
      complianceViolationsCounter.inc({ type: 'missing_insurance' });
    }

    const requiredSignatures = ['generator', 'transporter'];
    const existingSignatures = manifest.signatures.map(s => s.signerRole);
    
    for (const required of requiredSignatures) {
      if (!existingSignatures.includes(required)) {
        warnings.push(`Missing ${required} signature`);
      }
    }

    if (manifest.status !== 'archived' && manifest.status !== 'disposed') {
      const ageInDays = differenceInDays(new Date(), manifest.createdAt);
      const overdueDays = environment.MANIFEST_OVERDUE_DAYS;
      
      if (ageInDays > overdueDays) {
        violations.push(`Manifest overdue by ${ageInDays - overdueDays} days`);
        complianceViolationsCounter.inc({ type: 'overdue_manifest' });
      } else if (ageInDays > overdueDays - 10) {
        warnings.push(`Manifest approaching overdue threshold (${overdueDays - ageInDays} days remaining)`);
      }
    }

    if (manifest.wasteClassification === 'hazardous' && !manifest.specialInstructions) {
      warnings.push('Hazardous waste manifest missing special handling instructions');
    }

    if (manifest.containerCount > 100) {
      suggestions.push('Consider splitting large shipments for safety');
    }

    if (manifest.signatures.length >= 2) {
      const sortedSigs = [...manifest.signatures].sort(
        (a, b) => a.signedAt.getTime() - b.signedAt.getTime()
      );
      const firstSig = sortedSigs[0];
      const lastSig = sortedSigs[sortedSigs.length - 1];
      const sigSpan = differenceInDays(lastSig.signedAt, firstSig.signedAt);
      
      if (sigSpan > 30) {
        warnings.push(`Signatures span ${sigSpan} days, which may indicate delays`);
      }
    }

    const compliant = violations.length === 0;
    const result: ComplianceResult = {
      compliant,
      violations,
      warnings,
      suggestions,
    };

    await prisma.complianceCheck.create({
      data: {
        manifestId,
        compliant,
        violations,
        warnings,
        suggestions,
        checkedAt: new Date(),
      },
    });

    await cacheService.set(
      cacheService.generateKey('compliance', manifestId),
      result,
      3600
    );

    if (violations.length > 0) {
      const adminUsers = await prisma.user.findMany({
        where: { companyId: manifest.companyId, role: 'admin' },
        select: { id: true },
      });

      for (const admin of adminUsers) {
        await notificationService.send(admin.id, 'compliance_violation', {
          manifestId,
          manifestNumber: manifest.manifestNumber,
          violations,
        });
      }
    }

    logger.info('Compliance check completed', {
      manifestId,
      compliant,
      violationCount: violations.length,
      warningCount: warnings.length,
    });

    return result;
  }

  async batchValidateManifests(manifestIds: string[]) {
    const results: Record<string, ComplianceResult> = {};
    
    for (const id of manifestIds) {
      try {
        results[id] = await this.validateManifest(id);
      } catch (error) {
        logger.error(`Compliance check failed for manifest ${id}`, { error });
      }
    }

    return results;
  }

  async getComplianceReport(companyId: string, startDate: Date, endDate: Date) {
    const checks = await prisma.complianceCheck.findMany({
      where: {
        manifest: { companyId },
        checkedAt: { gte: startDate, lte: endDate },
      },
      include: {
        manifest: {
          select: { manifestNumber: true, status: true },
        },
      },
      orderBy: { checkedAt: 'desc' },
    });

    const totalChecks = checks.length;
    const compliantChecks = checks.filter(c => c.compliant).length;
    const allViolations = checks.flatMap(c => c.violations);
    
    const violationFrequency: Record<string, number> = {};
    allViolations.forEach(v => {
      violationFrequency[v] = (violationFrequency[v] || 0) + 1;
    });

    return {
      totalChecks,
      compliantChecks,
      nonCompliantChecks: totalChecks - compliantChecks,
      complianceRate: totalChecks > 0 ? (compliantChecks / totalChecks) * 100 : 100,
      topViolations: Object.entries(violationFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([violation, count]) => ({ violation, count })),
      checks,
    };
  }
}

export const complianceEngine = new ComplianceEngine();
