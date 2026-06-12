import { Request, Response, NextFunction } from 'express';
import { ManifestService } from './manifest.service';
import { AuthRequest } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';

const manifestService = new ManifestService();

export class ManifestController {
  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const manifest = await manifestService.createManifest(
        req.body,
        req.user!.userId,
        req.user!.companyId
      );
      res.status(201).json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const manifest = await manifestService.updateStatus(
        id,
        status,
        req.user!.userId,
        notes
      );
      res.json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const manifest = await manifestService.getManifest(
        req.params.id,
        req.user!.userId,
        req.user!.companyId
      );
      res.json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await manifestService.listManifests(
        req.user!.companyId,
        req.query,
        req.user!.userId
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async generatePDF(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pdf = await manifestService.generatePDF(req.params.id);
      res.json({ success: true, data: pdf });
    } catch (error) {
      next(error);
    }
  }

  async addSignature(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const sig = await manifestService.addSignature(
        req.params.id,
        req.body.signerRole,
        req.user!.userId,
        req.body
      );
      res.status(201).json({ success: true, data: sig });
    } catch (error) {
      next(error);
    }
  }

  async complianceStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const status = await manifestService.getComplianceStatus(req.params.id);
      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  }

  async uploadPhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw AppError.badRequest('Photo file is required');
      }
      const photo = await manifestService.uploadPhoto(
        req.params.id,
        req.user!.userId,
        req.file,
        req.body.caption
      );
      res.status(201).json({ success: true, data: photo });
    } catch (error) {
      next(error);
    }
  }

  async getPhotos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const photos = await manifestService.getPhotos(req.params.id);
      res.json({ success: true, data: photos });
    } catch (error) {
      next(error);
    }
  }

  async applyLegalHold(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { reason } = req.body;
      const manifest = await manifestService.applyLegalHold(
        req.params.id,
        reason,
        req.user!.userId
      );
      res.json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }

  async releaseLegalHold(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const manifest = await manifestService.releaseLegalHold(
        req.params.id,
        req.user!.userId
      );
      res.json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }

  async calculateRoute(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const route = await manifestService.calculateRoute(req.params.id, req.user!.companyId);
      res.json({ success: true, data: route });
    } catch (error) {
      next(error);
    }
  }

  async calculateTax(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tax = await manifestService.calculateTax(req.params.id);
      res.json({ success: true, data: tax });
    } catch (error) {
      next(error);
    }
  }

  async assignDriver(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { driverId } = req.body;
      const manifest = await manifestService.assignDriver(id, driverId, req.user!.userId);
      res.json({ success: true, data: manifest });
    } catch (error) {
      next(error);
    }
  }
}
