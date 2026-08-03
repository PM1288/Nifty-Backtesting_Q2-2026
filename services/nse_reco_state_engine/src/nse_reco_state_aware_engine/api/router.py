from __future__ import annotations

from fastapi import APIRouter

from nse_reco_state_aware_engine.api.routes.exports import router as exports_router
from nse_reco_state_aware_engine.api.routes.ops import router as ops_router
from nse_reco_state_aware_engine.api.routes.reco import router as reco_router
from nse_reco_state_aware_engine.api.routes.simulator import router as simulator_router

router = APIRouter()
router.include_router(ops_router, prefix="/api/v1/ops", tags=["ops"])
router.include_router(reco_router, prefix="/api/v1/reco", tags=["reco"])
router.include_router(simulator_router, prefix="/api/v1/reco/simulator", tags=["simulator"])
router.include_router(exports_router, prefix="/api/v1/exports", tags=["exports"])
