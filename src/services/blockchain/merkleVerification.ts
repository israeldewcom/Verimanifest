import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';
import { ethers } from 'ethers';
import { environment } from '../../config/environment';
import { cacheService } from '../cache.service';
import { blockchainQueue } from '../../config/queue';
import { blockchainTransactionsCounter } from '../../config/metrics';
import logger from '../../config/logger';

export class BlockchainVerificationService {
  private provider: ethers.JsonRpcProvider | null = null;
  private wallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private initialized = false;

  constructor() {
    if (environment.ETHEREUM_RPC_URL && environment.ETHEREUM_PRIVATE_KEY) {
      try {
        this.provider = new ethers.JsonRpcProvider(environment.ETHEREUM_RPC_URL);
        this.wallet = new ethers.Wallet(environment.ETHEREUM_PRIVATE_KEY, this.provider);

        if (environment.MANIFEST_VERIFICATION_CONTRACT) {
          const abi = [
            'function verifyManifest(string memory manifestHash) public view returns (bool)',
            'function anchorManifest(string memory manifestHash, string memory metadata) public returns (uint256)',
            'function getManifestTimestamp(uint256 index) public view returns (uint256)',
            'event ManifestAnchored(uint256 indexed index, string manifestHash, uint256 timestamp)',
          ];
          this.contract = new ethers.Contract(
            environment.MANIFEST_VERIFICATION_CONTRACT,
            abi,
            this.wallet
          );
        }
        this.initialized = true;
        logger.info('Blockchain verification service initialized');
      } catch (error) {
        logger.error('Failed to initialize blockchain service', { error });
      }
    } else {
      logger.info('Blockchain verification not configured');
    }
  }

  generateMerkleTree(events: any[]): { root: string; tree: MerkleTree } {
    const leaves = events.map((event) => keccak256(JSON.stringify(event)));
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = tree.getHexRoot();
    logger.info('Merkle tree generated', { root, leafCount: leaves.length });
    return { root, tree };
  }

  getMerkleProof(tree: MerkleTree, event: any): string[] {
    const leaf = keccak256(JSON.stringify(event));
    return tree.getHexProof(leaf);
  }

  verifyMerkleProof(tree: MerkleTree, event: any, proof: string[]): boolean {
    const leaf = keccak256(JSON.stringify(event));
    const root = tree.getHexRoot();
    return tree.verify(proof, leaf, root);
  }

  async anchorManifestToBlockchain(
    manifestHash: string,
    metadata: any
  ): Promise<string | null> {
    if (!this.initialized || !this.contract) {
      logger.warn('Blockchain verification not configured, skipping anchor');
      return null;
    }

    try {
      const gasEstimate = await this.contract.anchorManifest.estimateGas(
        manifestHash,
        JSON.stringify(metadata)
      );

      const tx = await this.contract.anchorManifest(
        manifestHash,
        JSON.stringify(metadata),
        { gasLimit: Math.ceil(Number(gasEstimate) * 1.2) }
      );

      const receipt = await tx.wait();

      blockchainTransactionsCounter.inc({ status: 'success' });

      logger.info('Manifest anchored to blockchain', {
        manifestHash,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      return receipt.hash;
    } catch (error: any) {
      logger.error('Failed to anchor manifest to blockchain', {
        error: error.message,
        manifestHash,
      });

      blockchainTransactionsCounter.inc({ status: 'failed' });

      await blockchainQueue.add(
        'anchor',
        { manifestHash, metadata },
        { delay: 60000, attempts: 3, backoff: { type: 'exponential', delay: 10000 } }
      );

      return null;
    }
  }

  async verifyManifestOnBlockchain(manifestHash: string): Promise<boolean> {
    if (!this.initialized || !this.contract) return false;

    const cacheKey = cacheService.generateKey('blockchain', 'verify', manifestHash);
    const cached = await cacheService.get<boolean>(cacheKey);
    if (cached !== null) return cached;

    try {
      const result = await this.contract.verifyManifest(manifestHash);
      await cacheService.set(cacheKey, result, 86400);
      return result;
    } catch (error: any) {
      logger.error('Failed to verify manifest on blockchain', {
        error: error.message,
        manifestHash,
      });
      return false;
    }
  }

  getVerificationUrl(transactionHash: string): string {
    if (environment.ETHEREUM_RPC_URL?.includes('mainnet')) {
      return `https://etherscan.io/tx/${transactionHash}`;
    } else if (environment.ETHEREUM_RPC_URL?.includes('polygon')) {
      return `https://polygonscan.com/tx/${transactionHash}`;
    } else if (environment.ETHEREUM_RPC_URL?.includes('sepolia')) {
      return `https://sepolia.etherscan.io/tx/${transactionHash}`;
    }
    return `https://etherscan.io/tx/${transactionHash}`;
  }
}

export const blockchainVerification = new BlockchainVerificationService();
