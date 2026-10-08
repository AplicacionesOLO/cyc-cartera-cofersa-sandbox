import pytest

from application.ports.file_storage import safe_key
from domain.exceptions import ValidationError
from infrastructure.aws.s3_file_storage import S3FileStorage


class StubS3:
    def __init__(self):
        self.calls = []

    def generate_presigned_url(self, operation, Params, ExpiresIn):
        self.calls.append((operation, Params, ExpiresIn))
        return f"https://s3/{Params['Key']}?op={operation}"

    def delete_objects(self, Bucket, Delete):
        self.calls.append(("delete", len(Delete["Objects"])))


def test_presign_upload_sets_content_type():
    s3 = StubS3()
    upload = S3FileStorage("bucket", s3).presign_upload("a/b.png", "image/png")
    assert upload.headers == {"Content-Type": "image/png"}
    assert s3.calls[0][1]["ContentType"] == "image/png"


def test_delete_is_chunked():
    s3 = StubS3()
    S3FileStorage("bucket", s3).delete([f"k{i}" for i in range(2500)])
    assert [c[1] for c in s3.calls] == [1000, 1000, 500]


@pytest.mark.parametrize("bad", ["../etc", "a//b", "/abs", "a/../b", "x\\y"])
def test_safe_key_rejects_traversal(bad):
    with pytest.raises(ValidationError):
        safe_key(bad)


def test_safe_key_joins_segments():
    assert safe_key("users", "123", "avatar.png") == "users/123/avatar.png"
