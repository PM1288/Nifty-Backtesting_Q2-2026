from nifty_stratlab.discovery.walkforward import expanding_walk_forward_splits


def test_splits_are_chronological_and_purged():
    splits = expanding_walk_forward_splits(500, minimum_train=200, test_size=50, purge=10, embargo=5)
    assert splits
    for split in splits:
        assert split.train_end + 10 == split.test_start
        assert split.train_end <= split.test_start
        assert split.test_end <= 500
