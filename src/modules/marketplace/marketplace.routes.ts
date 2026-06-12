import { Router } from 'express';
import { MarketplaceController } from './marketplace.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new MarketplaceController();

router.use(authenticate);
router.post('/listings', controller.createListing);
router.get('/listings', controller.getOpenListings);
router.get('/listings/mine', controller.getMyListings);
router.get('/listings/:id', controller.getListing);
router.post('/listings/:id/bids', controller.submitBid);
router.get('/bids/mine', controller.getMyBids);
router.post('/bids/:id/accept', controller.acceptBid);

export default router;
