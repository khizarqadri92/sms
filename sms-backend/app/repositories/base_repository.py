"""
Base repository — defines the interface every repository must implement.
Services depend only on this interface, never on a concrete DB driver.
"""
from abc import ABC, abstractmethod

class BaseRepository(ABC):

    @abstractmethod
    def find_by_id(self, id):
        pass

    @abstractmethod
    def find_all(self, filters=None):
        pass

    @abstractmethod
    def create(self, data: dict):
        pass

    @abstractmethod
    def update(self, id, data: dict):
        pass

    @abstractmethod
    def delete(self, id):
        pass
