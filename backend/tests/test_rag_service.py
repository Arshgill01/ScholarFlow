import pytest

from services.rag_service import RagService

INSUFFICIENT_DATA_MESSAGE = "Insufficient data in the current knowledge base to answer this query."


class DummyEmbeddings:
    def embed_query(self, query):
        assert query == "What does the paper say?"
        return [0.1, 0.2, 0.3]


class EmptyResultsQuery:
    def join(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def all(self):
        return []


class EmptyResultsDb:
    def query(self, *args, **kwargs):
        return EmptyResultsQuery()


class FakeLlmResponse:
    def __init__(self, content):
        self.content = content


class FakeLlm:
    def __init__(self, responses):
        self.responses = list(responses)
        self.prompts = []

    def invoke(self, prompt):
        self.prompts.append(prompt)
        return FakeLlmResponse(self.responses.pop(0))


class DummyChunk:
    def __init__(self, page_number, text_content):
        self.page_number = page_number
        self.text_content = text_content


class ResultsQuery(EmptyResultsQuery):
    def __init__(self, results):
        self.results = results

    def all(self):
        return self.results


class ResultsDb:
    def __init__(self, results):
        self.results = results

    def query(self, *args, **kwargs):
        return ResultsQuery(self.results)


class CapturingChatClient:
    def __init__(self, response_text):
        self.response_text = response_text
        self.calls = []

    def generate_content(self, request=None, timeout=None):
        self.calls.append({"request": request, "timeout": timeout})

        class Part:
            def __init__(self, text):
                self.text = text

        class Content:
            def __init__(self, text):
                self.parts = [Part(text)]

        class Candidate:
            def __init__(self, text):
                self.content = Content(text)

        class Response:
            def __init__(self, text):
                self.candidates = [Candidate(text)]

        return Response(self.response_text)


@pytest.mark.asyncio
async def test_query_knowledge_base_returns_three_values_when_no_documents_exist():
    service = RagService.__new__(RagService)
    service.db = EmptyResultsDb()
    service.embeddings = DummyEmbeddings()
    service.llm = object()

    response = await service.query_knowledge_base("What does the paper say?")

    assert response.status == "insufficient_data"
    assert response.sections[0].body == INSUFFICIENT_DATA_MESSAGE
    assert response.sources == []
    assert response.chunks == []


@pytest.mark.asyncio
async def test_query_knowledge_base_returns_structured_sections_for_happy_path():
    service = RagService.__new__(RagService)
    service.db = ResultsDb([(DummyChunk(1, "Important finding"), "paper.pdf")])
    service.embeddings = DummyEmbeddings()
    service.llm = FakeLlm([
        '{"synthesis":"Concise synthesis [paper.pdf, Page 1]","key_data_points":["Key point [paper.pdf, Page 1]"]}'
    ])

    response = await service.query_knowledge_base("What does the paper say?")

    assert response.status == "ok"
    assert response.sections[0].body == "Concise synthesis [paper.pdf, Page 1]"
    assert response.sections[1].items == ["Key point [paper.pdf, Page 1]"]
    assert response.sections[2].items == ["paper.pdf, Page 1"]
    assert response.answer == (
        "### Synthesis\nConcise synthesis [paper.pdf, Page 1]\n\n"
        "### Key Data Points\n- Key point [paper.pdf, Page 1]\n\n"
        "### Sources\n- paper.pdf, Page 1"
    )


@pytest.mark.asyncio
async def test_query_knowledge_base_retries_once_when_model_returns_invalid_json():
    service = RagService.__new__(RagService)
    service.db = ResultsDb([(DummyChunk(1, "Important finding"), "paper.pdf")])
    service.embeddings = DummyEmbeddings()
    service.llm = FakeLlm([
        "not valid json",
        '{"synthesis":"Recovered synthesis [paper.pdf, Page 1]","key_data_points":[]}',
    ])

    response = await service.query_knowledge_base("What does the paper say?")

    assert response.status == "ok"
    assert response.sections[0].body == "Recovered synthesis [paper.pdf, Page 1]"
    assert len(service.llm.prompts) == 2


@pytest.mark.asyncio
async def test_query_knowledge_base_returns_error_status_after_invalid_json_retry_exhausted():
    service = RagService.__new__(RagService)
    service.db = ResultsDb([(DummyChunk(1, "Important finding"), "paper.pdf")])
    service.embeddings = DummyEmbeddings()
    service.llm = FakeLlm([
        "not valid json",
        "still not valid json",
    ])

    response = await service.query_knowledge_base("What does the paper say?")

    assert response.status == "error"
    assert response.sections[0].body == "The language model returned an invalid structured response."


def test_invoke_chat_model_enforces_structured_json_schema(monkeypatch):
    service = RagService.__new__(RagService)
    service.llm = None
    service.chat_model = "models/gemma-4-31b-it"
    service.chat_client = CapturingChatClient(
        '{"synthesis":"Valid synthesis [paper.pdf, Page 1]","key_data_points":[]}'
    )

    monkeypatch.delenv("GOOGLE_CHAT_TIMEOUT_SECONDS", raising=False)

    response_text = service._invoke_chat_model("Prompt text")

    assert "Valid synthesis" in response_text
    assert len(service.chat_client.calls) == 1

    call = service.chat_client.calls[0]
    request = call["request"]
    assert call["timeout"] == 45.0
    assert request.model == "models/gemma-4-31b-it"
    assert request.contents[0].role == "user"
    assert request.generation_config.response_mime_type == "application/json"
    assert set(request.generation_config.response_schema.properties.keys()) == {
        "synthesis",
        "key_data_points",
    }


def test_invoke_chat_model_honors_timeout_override(monkeypatch):
    service = RagService.__new__(RagService)
    service.llm = None
    service.chat_model = "models/gemma-4-31b-it"
    service.chat_client = CapturingChatClient(
        '{"synthesis":"Valid synthesis [paper.pdf, Page 1]","key_data_points":[]}'
    )

    monkeypatch.setenv("GOOGLE_CHAT_TIMEOUT_SECONDS", "12.5")

    service._invoke_chat_model("Prompt text")

    assert service.chat_client.calls[0]["timeout"] == 12.5
