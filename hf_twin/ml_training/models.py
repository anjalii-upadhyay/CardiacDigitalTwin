"""Model pipelines and their tuning grids: naive baseline, ridge regression, support vector regression (SVR)."""

import numpy as np
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, RandomForestRegressor
from sklearn.feature_selection import SelectKBest, f_regression
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel, WhiteKernel
from sklearn.linear_model import ElasticNet
from sklearn.neighbors import KNeighborsRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR


def _pipe(model):
    # fill rare missing features with the training median, put every feature on the same scale, then fit
    return Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()), ("model", model)])


def make(name: str, y_std: float):
    """Return (pipeline, parameter grid) for a model name. Grids are searched with patient-grouped CV."""
    if name == "naive_mean":
        return Pipeline([("model", DummyRegressor(strategy="mean"))]), {}
    if name == "ridge":
        return _pipe(Ridge()), {"model__alpha": [0.1, 1.0, 10.0, 100.0]}
    if name == "svr_select":
        # same SVR, but it first keeps only the k inputs most related to the target (chosen on training data only)
        pipe = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
                         ("select", SelectKBest(f_regression)), ("model", SVR(kernel="rbf"))])
        return pipe, {
            "select__k": [5, 10, 15, "all"],
            "model__C": [1.0, 3.0, 10.0],
            "model__epsilon": list(np.round(np.array([0.1, 0.25]) * y_std, 3)),
            "model__gamma": ["scale", 0.03],
        }
    if name == "svr":
        # C: how strictly to fit; epsilon: error band ignored (as a share of the target's spread); gamma: curve flexibility
        return _pipe(SVR(kernel="rbf")), {
            "model__C": [0.3, 1.0, 3.0, 10.0],
            "model__epsilon": list(np.round(np.array([0.1, 0.25]) * y_std, 3)),
            "model__gamma": ["scale", 0.01, 0.1],
        }
    if name == "elasticnet":
        return _pipe(ElasticNet(max_iter=20000)), {"model__alpha": [0.1, 0.3, 1.0, 3.0], "model__l1_ratio": [0.2, 0.5, 0.8]}
    if name == "random_forest":
        return _pipe(RandomForestRegressor(n_estimators=300, random_state=0, n_jobs=1)), {
            "model__min_samples_leaf": [3, 5, 8], "model__max_features": ["sqrt", 0.5]}
    if name == "extra_trees":
        return _pipe(ExtraTreesRegressor(n_estimators=300, random_state=0, n_jobs=1)), {
            "model__min_samples_leaf": [3, 5, 8], "model__max_features": ["sqrt", 0.5]}
    if name == "gradient_boosting":
        return _pipe(GradientBoostingRegressor(learning_rate=0.05, subsample=0.8, random_state=0)), {
            "model__n_estimators": [100, 300], "model__max_depth": [2, 3], "model__min_samples_leaf": [5]}
    if name == "gaussian_process":
        # smooth curve plus a noise term; its settings are fitted from the training data itself (no grid needed)
        kernel = ConstantKernel(1.0) * RBF(length_scale=3.0) + WhiteKernel(noise_level=1.0)
        return _pipe(GaussianProcessRegressor(kernel=kernel, normalize_y=True, n_restarts_optimizer=2,
                                              random_state=0)), {}
    if name == "knn":
        return _pipe(KNeighborsRegressor()), {"model__n_neighbors": [5, 10, 15], "model__weights": ["uniform", "distance"]}
    raise ValueError(name)


MODEL_NAMES = ("naive_mean", "ridge", "svr")
COMPARISON_MODELS = ("ridge", "elasticnet", "svr", "random_forest", "extra_trees", "gradient_boosting",
                     "gaussian_process", "knn")
ENSEMBLE = ("svr", "gaussian_process", "random_forest")   # fixed before seeing results
