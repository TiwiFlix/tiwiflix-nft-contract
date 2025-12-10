import { Address, toNano, beginCell } from '@ton/core';
import { NftItem } from '../wrappers/NftItem';
import { NftCollection } from '../wrappers/NftCollection';
import { NftSale } from '../wrappers/NftSale';
import { NetworkProvider, compile } from '@ton/blueprint';

export async function run(provider: NetworkProvider, args: string[]) {
    const ui = provider.ui();

    // 1. Get NFT Address
    const nftAddressStr = args.length > 0 ? args[0] : await ui.input('NFT Address to sell');
    const nftAddress = Address.parse(nftAddressStr);
    
    // 2. Get Price
    const priceStr = args.length > 1 ? args[1] : await ui.input('Sale Price (in TON)');
    const price = toNano(priceStr);

    const sender = provider.sender().address;
    if (!sender) throw new Error('Sender address needed');

    console.log('Fetching NFT data and Royalties...');
    
    // Fetch NFT data to find Collection
    const nftItem = provider.open(NftItem.createFromAddress(nftAddress));
    const nftData = await nftItem.getNftData();
    
    let royaltyAddress = sender;
    let royaltyAmount = 0n;

    if (nftData.collectionAddress) {
        try {
            const collection = provider.open(NftCollection.createFromAddress(nftData.collectionAddress));
            const royaltyParams = await collection.getRoyaltyParams();
            
            // Calculate Royalty: Price * Factor / Base
            royaltyAmount = (price * BigInt(royaltyParams.factor)) / BigInt(royaltyParams.base);
            royaltyAddress = royaltyParams.address;
            
            console.log(`Royalty found: ${(Number(royaltyParams.factor) / Number(royaltyParams.base)) * 100}%`);
            console.log(`Royalty Amount: ${royaltyAmount} nanoTON`);
        } catch (e) {
            console.log('Could not fetch royalties (collection might not support them).');
        }
    } else {
        console.log('NFT has no collection, skipping royalties.');
    }

    // 3. Prepare Sale Contract
    const saleCode = await compile('NftSale');
    const saleConfig = {
        isComplete: false,
        createdAt: Math.floor(Date.now() / 1000),
        marketplaceAddress: sender, // Using sender as marketplace for simplicity/direct sale
        nftAddress: nftAddress,
        nftOwnerAddress: sender,
        fullPrice: price,
        marketplaceFeeAddress: sender, // No fee
        marketplaceFee: 0n,
        royaltyAddress: royaltyAddress,
        royaltyAmount: royaltyAmount,
    };
    
    const nftSale = provider.open(NftSale.createFromConfig(saleConfig, saleCode));
    
    console.log(`Deploying Sale Contract at ${nftSale.address}...`);

    await nftSale.sendDeploy(provider.sender(), toNano('0.05'));
    
    await provider.waitForDeploy(nftSale.address);
    console.log('Sale contract deployed!');

    // 4. Transfer NFT to Sale Contract
    console.log(`Transferring NFT ${nftAddress} to Sale Contract...`);
    
    // NftItem.sendTransfer is not in the wrapper, I need to implement it or use raw message
    // standard Transfer op: 0x5fcc3d14
    
    await provider.sender().send({
        to: nftAddress,
        value: toNano('0.1'),
        body: beginCell()
            .storeUint(0x5fcc3d14, 32) // op::transfer
            .storeUint(0, 64) // query_id
            .storeAddress(nftSale.address) // new_owner
            .storeAddress(sender) // response_destination
            .storeUint(0, 1) // custom_payload (maybe_ref)
            .storeCoins(toNano('0.01')) // forward_amount
            .storeUint(0, 1) // forward_payload (either bit 0 or 1+ref)
            .endCell()
    });

    console.log('Transfer sent. NFT should now be for sale.');
    console.log(`Verify with: npx blueprint run getForSaleNfts`);
}

