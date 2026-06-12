import { Request, Response, NextFunction } from 'express';
import { marketplaceService } from './marketplace.service';
import { AuthRequest } from '../../middleware/auth';

export class MarketplaceController {
  async createListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const listing = await marketplaceService.createListing(
        req.user!.companyId,
        req.body
      );
      res.status(201).json({ success: true, data: listing });
    } catch (error) {
      next(error);
    }
  }

  async getOpenListings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, ...filters } = req.query;
      const result = await marketplaceService.getOpenListings(
        Number(page) || 1,
        Number(limit) || 20,
        filters
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getListing(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const listing = await marketplaceService.getListing(req.params.id);
      res.json({ success: true, data: listing });
    } catch (error) {
      next(error);
    }
  }

  async submitBid(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const bid = await marketplaceService.submitBid(
        req.user!.companyId,
        req.params.id,
        req.body.amount,
        req.body.notes
      );
      res.status(201).json({ success: true, data: bid });
    } catch (error) {
      next(error);
    }
  }

  async acceptBid(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await marketplaceService.acceptBid(
        req.params.id,
        req.user!.companyId
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getMyListings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit } = req.query;
      const result = await marketplaceService.getMyListings(
        req.user!.companyId,
        Number(page) || 1,
        Number(limit) || 20
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async getMyBids(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit } = req.query;
      const result = await marketplaceService.getMyBids(
        req.user!.companyId,
        Number(page) || 1,
        Number(limit) || 20
      );
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}
