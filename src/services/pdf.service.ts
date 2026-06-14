import PDFDocument from 'pdfkit';
import { Upload } from '@aws-sdk/lib-storage';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PassThrough } from 'stream';
import prisma from '../config/database';
import { environment } from '../config/environment';
import { s3Client } from '../config/aws';
import { cacheService } from './cache.service';
import logger from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export class PdfService {
  async generateManifestPDF(manifestId: string): Promise<{ s3Key: string; url: string }> {
    const manifest = await prisma.manifest.findUnique({
      where: { id: manifestId },
      include: {
        generator: true,
        transporter: true,
        facility: true,
        signatures: true,
        complianceChecks: { orderBy: { checkedAt: 'desc' }, take: 1 },
      },
    });

    if (!manifest) throw new Error('Manifest not found');

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const stream = new PassThrough();
    const filename = `manifest-${manifest.manifestNumber}-${Date.now()}.pdf`;
    const s3Key = `manifests/${manifest.companyId}/${filename}`;

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: environment.S3_BUCKET,
        Key: s3Key,
        Body: stream,
        ContentType: 'application/pdf',
        Metadata: {
          manifestId,
          manifestNumber: manifest.manifestNumber,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    doc.pipe(stream);
    this.buildPDFContent(doc, manifest);
    doc.end();

    await upload.done();

    await prisma.manifestPDF.create({
      data: {
        manifestId,
        s3Key,
        filename,
        generatedAt: new Date(),
      },
    });

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: environment.S3_BUCKET,
        Key: s3Key,
      }),
      { expiresIn: 604800 }
    );

    await cacheService.del(cacheService.generateKey('manifest', manifestId));

    logger.info('PDF generated and uploaded', { manifestId, s3Key });

    return { s3Key, url };
  }

  private buildPDFContent(doc: PDFKit.PDFDocument, manifest: any) {
    doc.fontSize(18).text('UNIFORM HAZARDOUS WASTE MANIFEST', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text('EPA Form 8700-22', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Manifest Tracking Number: ${manifest.manifestNumber}`, { align: 'center' });
    doc.fontSize(10).text(`Status: ${manifest.status.replace(/_/g, ' ').toUpperCase()}`, { align: 'center' });
    doc.moveDown();
    this.drawHorizontalLine(doc);
    doc.moveDown();

    doc.fontSize(14).text('1. Generator Information', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10)
      .text(`Name: ${manifest.generator.name}`)
      .text(`EPA ID: ${manifest.generator.epaId || 'N/A'}`)
      .text(`Address: ${manifest.generator.address || 'N/A'}`)
      .text(`Contact: ${manifest.generator.phone || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('2. Transporter Information', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10)
      .text(`Name: ${manifest.transporter.name}`)
      .text(`EPA ID: ${manifest.transporter.epaId || 'N/A'}`)
      .text(`Address: ${manifest.transporter.address || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('3. Designated Facility', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10)
      .text(`Name: ${manifest.facility.name}`)
      .text(`EPA ID: ${manifest.facility.epaId || 'N/A'}`)
      .text(`Address: ${manifest.facility.address || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('4. Waste Description', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10)
      .text(`Type: ${manifest.wasteType}`)
      .text(`Classification: ${manifest.wasteClassification}`)
      .text(`Quantity: ${manifest.quantity} ${manifest.unit}`)
      .text(`Container: ${manifest.containerCount} x ${manifest.containerType}`)
      .text(`Pickup Date: ${manifest.pickupDate ? new Date(manifest.pickupDate).toLocaleDateString() : 'TBD'}`);
    
    if (manifest.specialInstructions) {
      doc.text(`Special Instructions: ${manifest.specialInstructions}`);
    }
    doc.moveDown();

    doc.fontSize(14).text('5. Signatures', { underline: true });
    doc.moveDown(0.3);
    if (manifest.signatures.length === 0) {
      doc.fontSize(10).text('No signatures yet');
    } else {
      for (const sig of manifest.signatures) {
        doc.fontSize(10)
          .text(`${sig.signerRole.toUpperCase()}: Signed on ${new Date(sig.signedAt).toLocaleString()}`);
        if (sig.geolocation) {
          doc.text(`  Location: ${sig.geolocation.latitude}, ${sig.geolocation.longitude}`);
        }
        doc.moveDown(0.3);
      }
    }
    doc.moveDown();

    if (manifest.complianceChecks?.length > 0) {
      const lastCheck = manifest.complianceChecks[0];
      doc.fontSize(14).text('6. Compliance Status', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10)
        .text(`Compliant: ${lastCheck.compliant ? 'YES' : 'NO'}`)
        .text(`Checked: ${new Date(lastCheck.checkedAt).toLocaleString()}`);
      
      if (lastCheck.violations.length > 0) {
        doc.text('Violations:');
        lastCheck.violations.forEach((v: string) => doc.text(`  - ${v}`));
      }
      doc.moveDown();
    }

    // Fixed: removed 'color' option which is invalid in PDFKit
    doc.fontSize(8).fillColor('grey').text(
      `Generated on ${new Date().toISOString()} by VeriManifest System`,
      { align: 'center' }
    );
  }

  private drawHorizontalLine(doc: PDFKit.PDFDocument) {
    const y = doc.y;
    doc.moveTo(50, y).lineTo(562, y).stroke();
  }
}

export const pdfService = new PdfService();
