import * as bdb from '../bdb' // eslint-disable-line import/no-namespace


export default class Asset {
    constructor(appId, type) {
        this.appId = appId
        this.assetType = type
        this.assetCollection = `${this.assetType}s`
        this.dataType = `${this.appId}:${this.assetType}`
    }

    load(query, dispatch, getState) {
        return bdb.searchAssets(query)
            .then(assetIds =>
                Promise.all(assetIds.map(assetId =>
                    bdb.getTransaction(assetId)
                        .then(transaction =>
                            this.updateStore(transaction.id, dispatch, getState)
                        )
                ))
            )
    }

    create(assetData, dispatch, getState, metadata = null) {
        const { publicKey, privateKey } = getState().identity.keypair
        const assetPayload = { type: this.dataType }
        assetPayload[this.assetType] = assetData

        return bdb.publish(
            publicKey,
            privateKey,
            assetPayload,
            {
                data: metadata
            })
            .then(tx => this.updateStore(tx.id, dispatch, getState))
            .catch(err => console.error(err))
    }

    transfer(transaction, toPublicKey, payload, dispatch, getState) {
        const state = getState()
        const { publicKey, privateKey } = state.identity.keypair
        return bdb.transfer(
            transaction,
            publicKey,
            privateKey,
            toPublicKey,
            {
                type: this.assetType,
                data: payload
            }
        )
        .then(() => {
            const assetId = bdb.getAssetId(transaction)
            this.updateStore(assetId, dispatch, getState)
        })
        .catch((err) => console.error(err))
    }

    updateStore(assetId, dispatch, getState) { // eslint-disable-line
        return bdb.listTransactions(assetId)
            .then((txList) => Promise.all(txList.map(tx => bdb.getTransaction(tx.id))))
            .then((txList) => {
                const assetFromState = getState()[this.assetCollection][assetId]

                if (assetFromState) {
                    return this._dispatch('UPDATE', txList, dispatch, getState)
                } else {
                    return this._dispatch('ADD', txList, dispatch, getState)
                }
            })
    }

    _dispatch(action, transactions, dispatch, getState) {
        const state = getState()
        const asset = transactions[0]
        const unspent = transactions[transactions.length - 1]
        const provenance = transactions.map((tx) => (
            {
                metadata: tx.metadata,
                timestamp: tx.votes[0].vote.timestamp,
                from: tx.inputs,
                to: tx.outputs,
                _tx: tx.id
            }
        ))

        const actionType = `${action}_${this.assetType.toUpperCase()}`
        const dispatchObject = { type: actionType }

        switch (action) {
            case 'ADD':
                dispatchObject[this.assetType] = {
                    ...asset.asset.data.data,
                    _pk: asset.inputs[0].owners_before[0],
                    _tx: asset.id,
                    provenance
                }
                return dispatch(dispatchObject)
            case 'UPDATE':
                dispatchObject[this.assetType] = {
                    ...state[this.assetCollection][bdb.getAssetId(unspent)],
                    provenance
                }
                return dispatch(dispatchObject)
            default:
                return null
        }
    }
}
