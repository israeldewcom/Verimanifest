import { cacheService } from './cache.service';
import { environment } from '../config/environment';
import logger from '../config/logger';
import prisma from '../config/database';

export interface RouteStop {
  lat: number;
  lng: number;
  address: string;
  type: 'pickup' | 'delivery' | 'waypoint';
}

export interface OptimizedRoute {
  totalDistance: number;
  totalDuration: number;
  waypoints: RouteStop[];
  polyline: string;
  instructions: string[];
}

class RouteOptimizer {
  private geocoder: any;

  constructor() {
    if (environment.GEOCODER_PROVIDER === 'google' && environment.GOOGLE_MAPS_API_KEY) {
      const { Client } = require('@googlemaps/google-maps-services-js');
      this.geocoder = new Client({});
    } else if (environment.GEOCODER_PROVIDER === 'mapbox' && environment.MAPBOX_ACCESS_TOKEN) {
      const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
      this.geocoder = mbxGeocoding({ accessToken: environment.MAPBOX_ACCESS_TOKEN });
    } else {
      logger.warn('No geocoding provider configured, using direct coordinates only');
    }
  }

  async geocodeAddress(address: string, companyId?: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.geocoder) return null;
    const cacheKey = cacheService.generateKey('geocode', address);
    const cached = await cacheService.get<{ lat: number; lng: number }>(cacheKey);
    if (cached) return cached;

    try {
      let result;
      if (environment.GEOCODER_PROVIDER === 'google') {
        const response = await this.geocoder.geocode({
          params: { address, key: environment.GOOGLE_MAPS_API_KEY }
        });
        if (response.data.results.length > 0) {
          const loc = response.data.results[0].geometry.location;
          result = { lat: loc.lat, lng: loc.lng };
        }
      } else if (environment.GEOCODER_PROVIDER === 'mapbox') {
        const response = await this.geocoder.forwardGeocode({
          query: address,
          limit: 1
        }).send();
        if (response.body.features.length > 0) {
          const [lng, lat] = response.body.features[0].center;
          result = { lat, lng };
        }
      }
      if (result) {
        await cacheService.set(cacheKey, result, environment.LOCATION_CACHE_TTL);
        return result;
      }
    } catch (error) {
      logger.error('Geocoding failed', { address, error });
    }

    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { latitude: true, longitude: true, address: true }
      });
      if (company?.latitude && company?.longitude) {
        logger.warn(`Using company HQ as fallback for address: ${address}`, { companyId });
        return { lat: company.latitude, lng: company.longitude };
      }
    }
    throw new Error(`Cannot geocode address "${address}" – no fallback coordinates available`);
  }

  async optimizeRoute(stops: RouteStop[], companyId?: string): Promise<OptimizedRoute> {
    const enrichedStops: RouteStop[] = [];
    for (const stop of stops) {
      if (stop.lat && stop.lng) {
        enrichedStops.push(stop);
      } else if (stop.address) {
        const coords = await this.geocodeAddress(stop.address, companyId);
        enrichedStops.push({ ...stop, lat: coords.lat, lng: coords.lng });
      } else {
        throw new Error(`Stop has neither lat/lng nor address: ${JSON.stringify(stop)}`);
      }
    }

    const cacheKey = cacheService.generateKey(
      'route',
      ...enrichedStops.map(s => `${s.lat},${s.lng}`)
    );
    const cached = await cacheService.get<OptimizedRoute>(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.calculateRoute(enrichedStops);
      await cacheService.set(cacheKey, result, 3600);
      return result;
    } catch (error) {
      logger.error('Route optimization failed, using direct route', { error });
      return this.calculateDirectRoute(enrichedStops);
    }
  }

  private async calculateRoute(stops: RouteStop[]): Promise<OptimizedRoute> {
    if (stops.length <= 2) {
      return this.calculateDirectRoute(stops);
    }

    const optimized: RouteStop[] = [stops[0]];
    const unvisited = stops.slice(1);
    let currentStop = stops[0];

    while (unvisited.length > 0) {
      let nearestIndex = 0;
      let nearestDist = this.calculateDistance(currentStop, unvisited[0]);

      for (let i = 1; i < unvisited.length; i++) {
        const dist = this.calculateDistance(currentStop, unvisited[i]);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIndex = i;
        }
      }

      currentStop = unvisited[nearestIndex];
      optimized.push(currentStop);
      unvisited.splice(nearestIndex, 1);
    }

    optimized.push(optimized[0]);

    let totalDistance = 0;
    for (let i = 1; i < optimized.length; i++) {
      totalDistance += this.calculateDistance(optimized[i - 1], optimized[i]);
    }

    const instructions = this.generateInstructions(optimized);

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round((totalDistance / 50) * 60),
      waypoints: optimized,
      polyline: '',
      instructions,
    };
  }

  private calculateDirectRoute(stops: RouteStop[]): OptimizedRoute {
    let totalDistance = 0;
    for (let i = 1; i < stops.length; i++) {
      totalDistance += this.calculateDistance(stops[i - 1], stops[i]);
    }

    return {
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round((totalDistance / 50) * 60),
      waypoints: stops,
      polyline: '',
      instructions: this.generateInstructions(stops),
    };
  }

  private calculateDistance(point1: RouteStop, point2: RouteStop): number {
    const R = 3959;
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(point1.lat)) *
        Math.cos(this.toRad(point2.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private generateInstructions(stops: RouteStop[]): string[] {
    const instructions: string[] = [];
    
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const distance = i > 0 
        ? this.calculateDistance(stops[i - 1], stops[i])
        : 0;
      
      if (i === 0) {
        instructions.push(`Start at ${stop.address || `(${stop.lat}, ${stop.lng})`}`);
      } else if (i === stops.length - 1 && stops.length > 2 && stops[i].type === stops[0].type) {
        instructions.push(`Return to ${stop.address || `(${stop.lat}, ${stop.lng})`} (${Math.round(distance * 10) / 10} miles)`);
      } else {
        instructions.push(
          `Travel ${Math.round(distance * 10) / 10} miles to ${stop.address || `(${stop.lat}, ${stop.lng})`}`
        );
      }
    }

    return instructions;
  }
}

export const routeOptimizer = new RouteOptimizer();
